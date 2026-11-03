// Transport: vehicles, routes and stops, student allocations (with guardian
// consent and transport fees), driver and attendant trips with a boarding
// manifest, and exceptions. Boarding is recorded by people, never guessed.
import { audit, requirePerm } from '../access.js'
import { all, one, run, transaction } from '../db.js'
import { addDays, isoDate } from '../dates.js'
import { bad, forbidden, id, notFound, required, text } from '../http.js'
import { childrenFor, conflict, date, guardiansOf, insertId, notify, oneOf, paise, schoolOf, studentOf, usersWithPerm, yearOf } from './common.js'
import { cancelDemand, createDemand } from './fees.js'

const STALE_GPS_MS = 5 * 60e3

function docFlags(v, today = isoDate()) {
  const soon = addDays(today, 30)
  return ['insurance_until', 'fitness_until', 'permit_until'].map((k) => ({ doc: k.replace('_until', ''), until: v[k], state: !v[k] ? 'missing' : v[k] < today ? 'expired' : v[k] <= soon ? 'expiring' : 'ok' }))
}

function routeRows(schoolId) {
  return all(
    `SELECT r.*, v.reg_no, v.capacity, v.status AS vehicle_status, d.name AS driver_name, a.name AS attendant_name,
       (SELECT COUNT(*) FROM transport_allocations t WHERE t.route_id = r.id AND t.status = 'active') AS riders
     FROM transport_routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id LEFT JOIN users d ON d.id = r.driver_user_id LEFT JOIN users a ON a.id = r.attendant_user_id
     WHERE r.school_id = ? ORDER BY r.code`,
    schoolId,
  )
}

const routeView = (r) => ({
  id: r.id,
  code: r.code,
  name: { en: r.name_en, kn: r.name_kn },
  vehicle: r.vehicle_id ? { id: r.vehicle_id, regNo: r.reg_no, capacity: r.capacity, status: r.vehicle_status } : null,
  driver: r.driver_user_id ? { id: r.driver_user_id, name: r.driver_name } : null,
  attendant: r.attendant_user_id ? { id: r.attendant_user_id, name: r.attendant_name } : null,
  monthlyFeePaise: r.monthly_fee_paise,
  riders: r.riders,
  stops: all('SELECT * FROM route_stops WHERE route_id = ? ORDER BY seq', r.id).map((s) => ({ id: s.id, seq: s.seq, name: s.name, pickupTime: s.pickup_time, dropTime: s.drop_time })),
})

function manifest(routeId) {
  return all(
    `SELECT t.student_user_id AS id, u.name, s.name AS stop, s.seq, s.pickup_time, s.drop_time FROM transport_allocations t JOIN users u ON u.id = t.student_user_id
     JOIN route_stops s ON s.id = t.stop_id WHERE t.route_id = ? AND t.status = 'active' ORDER BY s.seq, u.name`,
    routeId,
  )
}

function tripView(trip) {
  const events = all('SELECT student_user_id, event, at FROM trip_events WHERE trip_id = ? ORDER BY id', trip.id)
  const lastPing = one('SELECT lat, lng, at FROM gps_pings WHERE trip_id = ? ORDER BY id DESC LIMIT 1', trip.id)
  const riders = manifest(trip.route_id).map((m) => {
    const ev = events.filter((e) => e.student_user_id === m.id)
    const has = (k) => ev.find((e) => e.event === k)?.at ?? null
    return { id: m.id, name: m.name, stop: m.stop, time: trip.direction === 'to_school' ? m.pickup_time : m.drop_time, boarded: has('boarded'), alighted: has('alighted'), absent: has('absent') }
  })
  const unaccounted = riders.filter((x) => !x.absent && (!x.boarded || !x.alighted))
  return {
    id: trip.id,
    routeId: trip.route_id,
    date: trip.trip_date,
    direction: trip.direction,
    status: trip.status,
    attendantPresent: Boolean(trip.attendant_present),
    startedAt: trip.started_at,
    closedAt: trip.closed_at,
    closingNote: trip.closing_note,
    riders,
    onBoard: riders.filter((x) => x.boarded && !x.alighted).length,
    unaccounted: unaccounted.length,
    lastPing,
    gpsStale: trip.status === 'started' && (!lastPing || Date.now() - Date.parse(lastPing.at) > STALE_GPS_MS),
  }
}

// Things a transport manager should look at today.
function exceptions(schoolId) {
  const today = isoDate()
  const out = []
  for (const r of routeRows(schoolId)) {
    if (r.vehicle_id && r.riders > r.capacity) out.push({ kind: 'over_capacity', route: r.code, detail: `${r.riders}/${r.capacity}` })
    if (!r.vehicle_id || !r.driver_user_id) out.push({ kind: 'unassigned', route: r.code, detail: !r.vehicle_id ? 'vehicle' : 'driver' })
  }
  for (const v of all("SELECT * FROM vehicles WHERE school_id = ? AND status = 'active'", schoolId)) {
    for (const f of docFlags(v)) if (f.state !== 'ok') out.push({ kind: `document_${f.state}`, route: v.reg_no, detail: `${f.doc} ${f.until ?? ''}`.trim() })
  }
  for (const t of all('SELECT t.*, r.code FROM trips t JOIN transport_routes r ON r.id = t.route_id WHERE t.school_id = ? AND t.trip_date = ?', schoolId, today)) {
    const v = tripView(t)
    if (!v.attendantPresent) out.push({ kind: 'no_attendant', route: t.code, detail: t.direction })
    if (v.gpsStale) out.push({ kind: 'gps_stale', route: t.code, detail: t.direction })
    if (t.status === 'closed' && t.closing_note) out.push({ kind: 'closed_with_note', route: t.code, detail: t.closing_note })
  }
  return out
}

// Monthly transport demands for the rest of the academic year.
function raiseTransportFees(schoolId, alloc, route, by) {
  if (!route.monthly_fee_paise) return 0
  const year = yearOf(schoolId)
  const head = one("SELECT id FROM fee_heads WHERE school_id = ? AND kind = 'transport' ORDER BY id LIMIT 1", schoolId)
  if (!head) return 0
  let n = 0
  let month = alloc.from_date.slice(0, 7)
  const end = year.ends_on.slice(0, 7)
  for (let i = 1; month <= end && i <= 12; i++) {
    if (createDemand({ schoolId, studentId: alloc.student_user_id, yearId: year.id, headId: head.id, installmentNo: i, description: `Transport ${route.code} ${month}`, dueOn: `${month}-10`, amount: route.monthly_fee_paise, source: 'transport', sourceRef: `alloc:${alloc.id}:${month}`, by })) n++
    const [y, m] = month.split('-').map(Number)
    month = m === 12 ? `${y + 1}-01` : `${y}-${String(m + 1).padStart(2, '0')}`
  }
  return n
}

function myRoutes(req) {
  const s = schoolOf(req)
  if (req.ctx.perms.has('transport.manage')) return routeRows(s)
  return routeRows(s).filter((r) => r.driver_user_id === req.user.id || r.attendant_user_id === req.user.id)
}

function tripFor(req, tripId) {
  const t = one('SELECT * FROM trips WHERE id = ? AND school_id = ?', tripId, schoolOf(req))
  if (!t) throw notFound()
  if (!myRoutes(req).some((r) => r.id === t.route_id)) throw forbidden()
  return t
}

export function registerTransport(r) {
  r.get('/transport', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    res.json({
      routes: routeRows(s).map(routeView),
      vehicles: all('SELECT * FROM vehicles WHERE school_id = ? ORDER BY reg_no', s).map((v) => ({ id: v.id, regNo: v.reg_no, capacity: v.capacity, status: v.status, documents: docFlags(v), insuranceUntil: v.insurance_until, fitnessUntil: v.fitness_until, permitUntil: v.permit_until })),
      crew: all(
        `SELECT DISTINCT u.id, u.name, m.role FROM memberships m JOIN users u ON u.id = m.user_id WHERE m.school_id = ? AND m.status = 'active' AND m.role IN ('driver', 'attendant', 'transport_manager') ORDER BY u.name`,
        s,
      ),
      exceptions: exceptions(s),
      trips: all('SELECT t.*, r.code FROM trips t JOIN transport_routes r ON r.id = t.route_id WHERE t.school_id = ? AND t.trip_date = ? ORDER BY r.code', s, isoDate()).map((t) => ({ ...tripView(t), route: t.code })),
    })
  })

  r.get('/transport/routes/:id/riders', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const route = one('SELECT * FROM transport_routes WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!route) throw notFound()
    res.json({
      riders: all(
        `SELECT t.id, t.from_date, u.name, u.id AS student_id, s.name AS stop, g.name AS consent_by FROM transport_allocations t JOIN users u ON u.id = t.student_user_id
         JOIN route_stops s ON s.id = t.stop_id LEFT JOIN users g ON g.id = t.consent_guardian_user_id WHERE t.route_id = ? AND t.status = 'active' ORDER BY s.seq, u.name`,
        route.id,
      ).map((x) => ({ id: x.id, studentId: x.student_id, name: x.name, stop: x.stop, from: x.from_date, consentBy: x.consent_by })),
    })
  })

  r.post('/transport/vehicles', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const reg = required(req.body.regNo, 20).toUpperCase()
    if (one('SELECT 1 AS x FROM vehicles WHERE school_id = ? AND reg_no = ?', s, reg)) throw conflict('duplicate')
    const cap = Number(req.body.capacity)
    if (!Number.isInteger(cap) || cap < 1 || cap > 100) throw bad('invalid.capacity')
    const opt = (k) => (req.body[k] ? date(req.body[k]) : null)
    const vid = insertId('INSERT INTO vehicles (school_id, reg_no, capacity, insurance_until, fitness_until, permit_until) VALUES (?, ?, ?, ?, ?, ?)', s, reg, cap, opt('insuranceUntil'), opt('fitnessUntil'), opt('permitUntil'))
    audit(req, 'transport.vehicle_added', { entityType: 'vehicle', entityId: vid })
    res.status(201).json({ id: vid })
  })

  r.patch('/transport/vehicles/:id', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const v = one('SELECT * FROM vehicles WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!v) throw notFound()
    const pick = (k, col) => (req.body[k] === undefined ? v[col] : req.body[k] ? date(req.body[k]) : null)
    const status = req.body.status === undefined ? v.status : oneOf(req.body.status, ['active', 'maintenance', 'retired'])
    run('UPDATE vehicles SET insurance_until = ?, fitness_until = ?, permit_until = ?, status = ? WHERE id = ?', pick('insuranceUntil', 'insurance_until'), pick('fitnessUntil', 'fitness_until'), pick('permitUntil', 'permit_until'), status, v.id)
    audit(req, 'transport.vehicle_updated', { entityType: 'vehicle', entityId: v.id })
    res.json({ ok: true })
  })

  r.post('/transport/routes', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const code = required(req.body.code, 12).toUpperCase()
    if (one('SELECT 1 AS x FROM transport_routes WHERE school_id = ? AND code = ?', s, code)) throw conflict('duplicate')
    const rid = insertId(
      'INSERT INTO transport_routes (school_id, code, name_en, name_kn, monthly_fee_paise) VALUES (?, ?, ?, ?, ?)',
      s, code, required(req.body.nameEn, 80), required(req.body.nameKn, 80), req.body.monthlyFeePaise ? paise(req.body.monthlyFeePaise) : 0,
    )
    audit(req, 'transport.route_added', { entityType: 'route', entityId: rid })
    res.status(201).json({ id: rid })
  })

  // Assigns vehicle, driver and attendant. Crew must be this school's drivers/attendants.
  r.patch('/transport/routes/:id', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const route = one('SELECT * FROM transport_routes WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!route) throw notFound()
    const crew = (k, roles, cur) => {
      if (req.body[k] === undefined) return cur
      if (!req.body[k]) return null
      const uid = id(req.body[k])
      if (!one(`SELECT 1 AS x FROM memberships WHERE user_id = ? AND school_id = ? AND status = 'active' AND role IN (${roles.map(() => '?').join(',')})`, uid, s, ...roles)) throw bad('invalid.crew')
      return uid
    }
    let vehicle = route.vehicle_id
    if (req.body.vehicleId !== undefined) {
      vehicle = req.body.vehicleId ? id(req.body.vehicleId) : null
      if (vehicle && !one('SELECT 1 AS x FROM vehicles WHERE id = ? AND school_id = ?', vehicle, s)) throw bad('invalid.vehicle')
    }
    const fee = req.body.monthlyFeePaise === undefined ? route.monthly_fee_paise : paise(req.body.monthlyFeePaise, { allowZero: true })
    run(
      'UPDATE transport_routes SET vehicle_id = ?, driver_user_id = ?, attendant_user_id = ?, monthly_fee_paise = ? WHERE id = ?',
      vehicle, crew('driverId', ['driver', 'transport_manager'], route.driver_user_id), crew('attendantId', ['attendant'], route.attendant_user_id), fee, route.id,
    )
    audit(req, 'transport.route_updated', { entityType: 'route', entityId: route.id })
    res.json({ ok: true })
  })

  r.post('/transport/routes/:id/stops', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const route = one('SELECT * FROM transport_routes WHERE id = ? AND school_id = ?', id(req.params.id), s)
    if (!route) throw notFound()
    const time = (v) => {
      if (!/^\d{2}:\d{2}$/.test(String(v))) throw bad('invalid.time')
      return v
    }
    const seq = (one('SELECT MAX(seq) AS m FROM route_stops WHERE route_id = ?', route.id).m ?? 0) + 1
    const sid = insertId('INSERT INTO route_stops (route_id, seq, name, pickup_time, drop_time) VALUES (?, ?, ?, ?, ?)', route.id, seq, required(req.body.name, 80), time(req.body.pickupTime), time(req.body.dropTime))
    res.status(201).json({ id: sid })
  })

  // A child is added to a route only with a guardian's recorded consent and a free seat.
  r.post('/transport/allocations', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const st = studentOf(s, id(req.body.studentId))
    const route = one('SELECT r.*, v.capacity FROM transport_routes r LEFT JOIN vehicles v ON v.id = r.vehicle_id WHERE r.id = ? AND r.school_id = ?', id(req.body.routeId), s)
    if (!route) throw notFound()
    const stop = one('SELECT * FROM route_stops WHERE id = ? AND route_id = ?', id(req.body.stopId), route.id)
    if (!stop) throw bad('invalid.stop')
    const guardianId = id(req.body.consentGuardianId)
    if (!guardiansOf(s, st.id).some((g) => g.guardian_user_id === guardianId)) throw bad('consent.required')
    if (!route.capacity) throw conflict('route.no_vehicle')
    if (one("SELECT COUNT(*) AS n FROM transport_allocations WHERE route_id = ? AND status = 'active'", route.id).n >= route.capacity) throw conflict('route.full')
    if (one("SELECT 1 AS x FROM transport_allocations WHERE student_user_id = ? AND status = 'active'", st.id)) throw conflict('transport.already_allocated')
    const from = req.body.fromDate ? date(req.body.fromDate) : isoDate()
    const out = transaction(() => {
      const aid = insertId(
        'INSERT INTO transport_allocations (school_id, student_user_id, route_id, stop_id, from_date, consent_guardian_user_id, created_by) VALUES (?, ?, ?, ?, ?, ?, ?)',
        s, st.id, route.id, stop.id, from, guardianId, req.user.id,
      )
      const fees = raiseTransportFees(s, one('SELECT * FROM transport_allocations WHERE id = ?', aid), route, req.user.id)
      return { id: aid, feesCreated: fees }
    })
    audit(req, 'transport.allocated', { entityType: 'transport_allocation', entityId: out.id, detail: { route: route.code, student: st.id, consentBy: guardianId } })
    res.status(201).json(out)
  })

  // Ending a route stops future months' transport fees that are still unpaid.
  r.post('/transport/allocations/:id/end', requirePerm('transport.manage'), (req, res) => {
    const s = schoolOf(req)
    const a = one("SELECT * FROM transport_allocations WHERE id = ? AND school_id = ? AND status = 'active'", id(req.params.id), s)
    if (!a) throw notFound()
    const to = req.body.toDate ? date(req.body.toDate) : isoDate()
    let cancelled = 0
    transaction(() => {
      run("UPDATE transport_allocations SET status = 'ended', to_date = ? WHERE id = ?", to, a.id)
      for (const d of all("SELECT id FROM fee_demands WHERE school_id = ? AND source = 'transport' AND source_ref LIKE ? AND status = 'open' AND due_on > ?", s, `alloc:${a.id}:%`, to)) {
        cancelDemand(s, d.id, req.user.id, 'transport ended')
        cancelled++
      }
    })
    audit(req, 'transport.allocation_ended', { entityType: 'transport_allocation', entityId: a.id, detail: { cancelled } })
    res.json({ ok: true, cancelledDemands: cancelled })
  })

  // ----- Trips (drivers, attendants, transport managers) -----

  r.get('/trips/today', requirePerm('transport.operate'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    res.json({
      date: today,
      routes: myRoutes(req).map((route) => ({
        ...routeView(route),
        manifest: manifest(route.id).map((m) => ({ id: m.id, name: m.name, stop: m.stop })),
        trips: all('SELECT * FROM trips WHERE route_id = ? AND trip_date = ? ORDER BY id', route.id, today).map(tripView),
      })),
      school: s,
    })
  })

  r.post('/trips', requirePerm('transport.operate'), (req, res) => {
    const s = schoolOf(req)
    const routeId = id(req.body.routeId)
    if (!myRoutes(req).some((x) => x.id === routeId)) throw forbidden()
    const direction = oneOf(req.body.direction, ['to_school', 'to_home'])
    if (one('SELECT 1 AS x FROM trips WHERE route_id = ? AND trip_date = ? AND direction = ?', routeId, isoDate(), direction)) throw conflict('trip.exists')
    const attendant = req.body.attendantPresent !== false
    const tid = insertId('INSERT INTO trips (school_id, route_id, trip_date, direction, attendant_present, started_by) VALUES (?, ?, ?, ?, ?, ?)', s, routeId, isoDate(), direction, attendant ? 1 : 0, req.user.id)
    if (!attendant) {
      const route = one('SELECT code FROM transport_routes WHERE id = ?', routeId)
      notify(s, usersWithPerm(s, 'transport.manage'), {
        title: { en: `Route ${route.code} started without an attendant`, kn: `ಮಾರ್ಗ ${route.code} ಸಹಾಯಕರಿಲ್ಲದೆ ಆರಂಭವಾಗಿದೆ` },
        link: '/transport',
        source: `trip:${tid}:attendant`,
        kind: 'alert',
      })
    }
    audit(req, 'transport.trip_started', { entityType: 'trip', entityId: tid, detail: { direction, attendant } })
    res.status(201).json({ id: tid })
  })

  r.post('/trips/:id/events', requirePerm('transport.operate'), (req, res) => {
    const s = schoolOf(req)
    const t = tripFor(req, id(req.params.id))
    if (t.status !== 'started') throw conflict('trip.closed')
    const studentId = id(req.body.studentId)
    if (!manifest(t.route_id).some((m) => m.id === studentId)) throw bad('trip.not_on_manifest')
    const event = oneOf(req.body.event, ['boarded', 'alighted', 'absent'])
    const has = (k) => one('SELECT 1 AS x FROM trip_events WHERE trip_id = ? AND student_user_id = ? AND event = ?', t.id, studentId, k)
    if (event === 'alighted' && !has('boarded')) throw conflict('trip.not_boarded')
    if (event === 'absent' && has('boarded')) throw conflict('trip.already_boarded')
    if (event === 'boarded' && has('absent')) run("DELETE FROM trip_events WHERE trip_id = ? AND student_user_id = ? AND event = 'absent'", t.id, studentId)
    const r2 = run('INSERT OR IGNORE INTO trip_events (trip_id, student_user_id, event, recorded_by) VALUES (?, ?, ?, ?)', t.id, studentId, event, req.user.id)
    if (r2.changes && event !== 'absent') {
      const name = one('SELECT name FROM users WHERE id = ?', studentId).name
      const where = t.direction === 'to_school' ? (event === 'boarded' ? 'on the bus to school' : 'at school') : event === 'boarded' ? 'on the bus home' : 'dropped at the stop'
      const whereKn = t.direction === 'to_school' ? (event === 'boarded' ? 'ಶಾಲೆಗೆ ಹೋಗುವ ಬಸ್ಸಿನಲ್ಲಿ' : 'ಶಾಲೆಯಲ್ಲಿ') : event === 'boarded' ? 'ಮನೆಗೆ ಬರುವ ಬಸ್ಸಿನಲ್ಲಿ' : 'ನಿಲ್ದಾಣದಲ್ಲಿ ಇಳಿದಿದ್ದಾರೆ'
      notify(s, guardiansOf(s, studentId, 'can_receive_comms').map((g) => g.guardian_user_id), {
        title: { en: `${name} is ${where}`, kn: `${name} ${whereKn}` },
        link: '/transport',
        source: `trip:${t.id}:${studentId}:${event}`,
        kind: 'transport',
      })
    }
    res.json({ ok: true })
  })

  r.post('/trips/:id/gps', requirePerm('transport.operate'), (req, res) => {
    const t = tripFor(req, id(req.params.id))
    if (t.status !== 'started') throw conflict('trip.closed')
    const lat = Number(req.body.lat)
    const lng = Number(req.body.lng)
    if (!(lat >= -90 && lat <= 90 && lng >= -180 && lng <= 180)) throw bad('invalid.location')
    run('INSERT INTO gps_pings (trip_id, lat, lng) VALUES (?, ?, ?)', t.id, lat, lng)
    res.json({ ok: true })
  })

  // A trip closes only when every child is accounted for, or with a written note
  // (which alerts the transport managers).
  r.post('/trips/:id/close', requirePerm('transport.operate'), (req, res) => {
    const s = schoolOf(req)
    const t = tripFor(req, id(req.params.id))
    if (t.status !== 'started') throw conflict('trip.closed')
    const v = tripView(t)
    const note = text(req.body.note, 300)
    if (v.unaccounted && note.length < 10) return res.status(409).json({ error: 'trip.unaccounted', students: v.riders.filter((x) => !x.absent && (!x.boarded || !x.alighted)).map((x) => x.name) })
    run("UPDATE trips SET status = 'closed', closed_at = strftime('%Y-%m-%dT%H:%M:%fZ', 'now'), closing_note = ? WHERE id = ?", note, t.id)
    if (v.unaccounted) {
      const route = one('SELECT code FROM transport_routes WHERE id = ?', t.route_id)
      notify(s, usersWithPerm(s, 'transport.manage'), {
        title: { en: `Route ${route.code} closed with ${v.unaccounted} child(ren) not confirmed`, kn: `ಮಾರ್ಗ ${route.code}: ${v.unaccounted} ಮಕ್ಕಳ ದೃಢೀಕರಣವಿಲ್ಲದೆ ಮುಚ್ಚಲಾಗಿದೆ` },
        body: { en: note, kn: note },
        link: '/transport',
        source: `trip:${t.id}:close`,
        kind: 'alert',
      })
    }
    audit(req, 'transport.trip_closed', { entityType: 'trip', entityId: t.id, detail: { unaccounted: v.unaccounted, note } })
    res.json({ ok: true })
  })

  // ----- Parents -----

  r.get('/family/transport', requirePerm('family.view'), (req, res) => {
    const s = schoolOf(req)
    const today = isoDate()
    res.json({
      children: childrenFor(req).map((c) => {
        const a = one(
          `SELECT t.*, r.code, r.name_en, r.name_kn, s.name AS stop, s.pickup_time, s.drop_time, v.reg_no, d.name AS driver, d.mobile AS driver_mobile
           FROM transport_allocations t JOIN transport_routes r ON r.id = t.route_id JOIN route_stops s ON s.id = t.stop_id
           LEFT JOIN vehicles v ON v.id = r.vehicle_id LEFT JOIN users d ON d.id = r.driver_user_id
           WHERE t.student_user_id = ? AND t.school_id = ? AND t.status = 'active'`,
          c.id, s,
        )
        const trips = a
          ? all('SELECT * FROM trips WHERE route_id = ? AND trip_date = ? ORDER BY id', a.route_id, today).map((t) => {
              const ev = all('SELECT event, at FROM trip_events WHERE trip_id = ? AND student_user_id = ?', t.id, c.id)
              return { direction: t.direction, status: t.status, events: ev }
            })
          : []
        return {
          id: c.id,
          name: c.name,
          firstName: { en: c.first_name_en, kn: c.first_name_kn },
          route: a && { code: a.code, name: { en: a.name_en, kn: a.name_kn }, stop: a.stop, pickupTime: a.pickup_time, dropTime: a.drop_time, vehicle: a.reg_no, driver: a.driver },
          trips,
        }
      }),
    })
  })
}
