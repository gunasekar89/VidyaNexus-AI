import { aiEnabled, providerLabel } from './ai.js'
import { createApp } from './app.js'
import { run } from './db.js'
import { migrate } from './migrate.js'
import { demoAccounts, seedIfEmpty } from './seed.js'
import { opsDemoPeople, seedOperations } from './ops/seed.js'
import { backfillLegacy, demoIdentities, seedDemoIdentities } from './tenancy.js'

const PORT = Number(process.env.PORT || 3000)

migrate()
if (seedIfEmpty()) {
  console.log('Created the demo school:')
  console.log(`  student  ${demoAccounts.student.email} / ${demoAccounts.student.password}`)
  console.log(`  teacher  ${demoAccounts.teacher.email} / ${demoAccounts.teacher.password}`)
}
if (backfillLegacy()) console.log('Attached existing students, teachers and records to the demo school (VPS-BLR).')
if (seedDemoIdentities()) {
  console.log('Added demo people for the new roles:')
  for (const [k, a] of Object.entries(demoIdentities)) console.log(`  ${k.padEnd(16)} ${a.email} / ${a.password}`)
}
if (seedOperations()) {
  console.log('Added demo data for admissions, fees, accounts, HR, transport, purchasing, library, reception, health and helpdesk, and the desk staff:')
  for (const [k, p] of Object.entries(opsDemoPeople)) {
    const password = p.mfa ? demoIdentities.principal.password : demoIdentities.driver.password
    console.log(`  ${k.padEnd(16)} ${p.email} / ${password}${p.mfa ? ' + 2-step code' : `  (or ${p.employeeNo})`}`)
  }
}
run('DELETE FROM sessions WHERE expires_at < ?', new Date().toISOString())

createApp().listen(PORT, () => {
  console.log(`VidyaNexus is running on http://localhost:${PORT}`)
  console.log(
    aiEnabled()
      ? `AI Tutor: on (${providerLabel()})`
      : 'AI Tutor: offline replies (set ANTHROPIC_API_KEY, or the AZURE_OPENAI_* settings, to turn on AI)',
  )
})
