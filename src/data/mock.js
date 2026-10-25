// Mock data for the demo. Every list item carries English and Kannada text
// so the EN / ಕನ್ನಡ toggle works across the whole app.

export const student = {
  name: 'Ananya S.',
  firstName: { en: 'Ananya', kn: 'ಅನನ್ಯ' },
  className: { en: 'Class 7A', kn: '7ನೇ ತರಗತಿ ಎ' },
  rollNo: '07A-18',
  school: { en: 'Vidya Public School, Bengaluru', kn: 'ವಿದ್ಯಾ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಬೆಂಗಳೂರು' },
  email: 'ananya.s@vidyanexus.school',
  guardian: 'Suresh K.',
  phone: '+91 98450 12345',
}

export const subjects = [
  {
    id: 'mathematics',
    name: { en: 'Mathematics', kn: 'ಗಣಿತ' },
    topic: { en: 'Algebra · Chapter 5', kn: 'ಬೀಜಗಣಿತ · ಅಧ್ಯಾಯ 5' },
    progress: 70,
    icon: 'pi',
    color: 'orange',
    teacher: 'Mrs. Lakshmi R.',
    chapters: [
      { en: 'Integers', kn: 'ಪೂರ್ಣಾಂಕಗಳು', done: true },
      { en: 'Fractions and Decimals', kn: 'ಭಿನ್ನರಾಶಿ ಮತ್ತು ದಶಮಾಂಶ', done: true },
      { en: 'Data Handling', kn: 'ದತ್ತಾಂಶ ನಿರ್ವಹಣೆ', done: true },
      { en: 'Simple Equations', kn: 'ಸರಳ ಸಮೀಕರಣಗಳು', done: true },
      { en: 'Algebraic Expressions', kn: 'ಬೀಜಗಣಿತೀಯ ಅಭಿವ್ಯಕ್ತಿಗಳು', done: false, current: true },
      { en: 'Lines and Angles', kn: 'ರೇಖೆಗಳು ಮತ್ತು ಕೋನಗಳು', done: false },
    ],
  },
  {
    id: 'science',
    name: { en: 'Science', kn: 'ವಿಜ್ಞಾನ' },
    topic: { en: 'Force and Motion', kn: 'ಬಲ ಮತ್ತು ಚಲನೆ' },
    progress: 58,
    icon: 'flask',
    color: 'blue',
    teacher: 'Mr. Arun P.',
    chapters: [
      { en: 'Nutrition in Plants', kn: 'ಸಸ್ಯಗಳಲ್ಲಿ ಪೋಷಣೆ', done: true },
      { en: 'Heat', kn: 'ಉಷ್ಣ', done: true },
      { en: 'Acids, Bases and Salts', kn: 'ಆಮ್ಲ, ಪ್ರತ್ಯಾಮ್ಲ ಮತ್ತು ಲವಣ', done: true },
      { en: 'Force and Motion', kn: 'ಬಲ ಮತ್ತು ಚಲನೆ', done: false, current: true },
      { en: 'Electric Current', kn: 'ವಿದ್ಯುತ್ ಪ್ರವಾಹ', done: false },
    ],
  },
  {
    id: 'english',
    name: { en: 'English', kn: 'ಇಂಗ್ಲಿಷ್' },
    topic: { en: 'Prose & Comprehension', kn: 'ಗದ್ಯ ಮತ್ತು ಗ್ರಹಿಕೆ' },
    progress: 80,
    icon: 'book',
    color: 'green',
    teacher: 'Ms. Priya D.',
    chapters: [
      { en: 'Three Questions', kn: 'ಮೂರು ಪ್ರಶ್ನೆಗಳು', done: true },
      { en: 'A Gift of Chappals', kn: 'ಚಪ್ಪಲಿಗಳ ಉಡುಗೊರೆ', done: true },
      { en: 'Gopal and the Hilsa Fish', kn: 'ಗೋಪಾಲ ಮತ್ತು ಹಿಲ್ಸಾ ಮೀನು', done: true },
      { en: 'The Ashes That Made Trees Bloom', kn: 'ಮರಗಳನ್ನು ಅರಳಿಸಿದ ಬೂದಿ', done: false, current: true },
    ],
  },
  {
    id: 'social-science',
    name: { en: 'Social Science', kn: 'ಸಮಾಜ ವಿಜ್ಞಾನ' },
    topic: { en: 'Our Constitution', kn: 'ನಮ್ಮ ಸಂವಿಧಾನ' },
    progress: 64,
    icon: 'globe',
    color: 'amber',
    teacher: 'Mr. Mohan G.',
    chapters: [
      { en: 'Tracing Changes', kn: 'ಬದಲಾವಣೆಗಳ ಅನ್ವೇಷಣೆ', done: true },
      { en: 'Environment', kn: 'ಪರಿಸರ', done: true },
      { en: 'Our Constitution', kn: 'ನಮ್ಮ ಸಂವಿಧಾನ', done: false, current: true },
      { en: 'Our Local Government', kn: 'ನಮ್ಮ ಸ್ಥಳೀಯ ಸರ್ಕಾರ', done: false },
    ],
  },
  {
    id: 'kannada',
    name: { en: 'Kannada', kn: 'ಕನ್ನಡ' },
    topic: { en: 'Poems · Lesson 3', kn: 'ಪದ್ಯಗಳು · ಪಾಠ 3' },
    progress: 52,
    icon: 'kannada',
    color: 'pink',
    teacher: 'Mrs. Shobha N.',
    chapters: [
      { en: 'Lesson 1', kn: 'ಪಾಠ 1', done: true },
      { en: 'Lesson 2', kn: 'ಪಾಠ 2', done: true },
      { en: 'Lesson 3 · Poems', kn: 'ಪಾಠ 3 · ಪದ್ಯಗಳು', done: false, current: true },
    ],
  },
  {
    id: 'computer-science',
    name: { en: 'Computer Science', kn: 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ' },
    topic: { en: 'Intro to Scratch', kn: 'ಸ್ಕ್ರ್ಯಾಚ್ ಪರಿಚಯ' },
    progress: 75,
    icon: 'cpu',
    color: 'violet',
    teacher: 'Mr. Kiran V.',
    chapters: [
      { en: 'Computer Basics', kn: 'ಕಂಪ್ಯೂಟರ್ ಮೂಲಗಳು', done: true },
      { en: 'Internet Safety', kn: 'ಅಂತರ್ಜಾಲ ಸುರಕ್ಷತೆ', done: true },
      { en: 'Intro to Scratch', kn: 'ಸ್ಕ್ರ್ಯಾಚ್ ಪರಿಚಯ', done: false, current: true },
    ],
  },
]

export const subjectById = Object.fromEntries(subjects.map((s) => [s.id, s]))

// Dot colours match the mockup's timetable bullets.
export const timetable = [
  { start: '08:00', end: '08:45', subject: 'mathematics', room: { en: 'Room 101', kn: 'ಕೊಠಡಿ 101' }, dot: '#6d4ee6' },
  { start: '08:50', end: '09:35', subject: 'science', room: { en: 'Room 102', kn: 'ಕೊಠಡಿ 102' }, dot: '#3b9ce6' },
  { start: '09:45', end: '10:30', subject: 'english', room: { en: 'Room 101', kn: 'ಕೊಠಡಿ 101' }, dot: '#22b07d' },
  { start: '10:45', end: '11:30', subject: 'social-science', room: { en: 'Room 103', kn: 'ಕೊಠಡಿ 103' }, dot: '#f08c2e' },
  { start: '12:15', end: '01:00', subject: 'kannada', room: { en: 'Room 104', kn: 'ಕೊಠಡಿ 104' }, dot: '#ec4f8c' },
  { start: '02:00', end: '02:45', subject: 'computer-science', room: { en: 'Lab 1', kn: 'ಪ್ರಯೋಗಾಲಯ 1' }, dot: '#5b3fd6' },
]

// Week schedule for the Smart Calendar (Mon–Sat).
export const weekSchedule = {
  Mon: ['mathematics', 'science', 'english', 'social-science', 'kannada', 'computer-science'],
  Tue: ['english', 'mathematics', 'kannada', 'science', 'social-science', 'mathematics'],
  Wed: ['science', 'social-science', 'mathematics', 'english', 'computer-science', 'kannada'],
  Thu: ['kannada', 'english', 'science', 'mathematics', 'social-science', 'science'],
  Fri: ['mathematics', 'computer-science', 'english', 'kannada', 'science', 'social-science'],
  Sat: ['english', 'mathematics', 'science', null, null, null],
}

export const homework = [
  {
    id: 'hw1',
    title: { en: 'Mathematics Homework', kn: 'ಗಣಿತ ಮನೆಗೆಲಸ' },
    detail: { en: 'Ch 5 – Practice questions', kn: 'ಅಧ್ಯಾಯ 5 – ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು' },
    subject: 'mathematics',
    due: 'today',
    dueLabel: { en: 'Today', kn: 'ಇಂದು' },
    done: false,
  },
  {
    id: 'hw2',
    title: { en: 'Science Worksheet', kn: 'ವಿಜ್ಞಾನ ಕಾರ್ಯಪತ್ರ' },
    detail: { en: 'Force and Motion', kn: 'ಬಲ ಮತ್ತು ಚಲನೆ' },
    subject: 'science',
    due: 'tomorrow',
    dueLabel: { en: 'Tomorrow', kn: 'ನಾಳೆ' },
    done: false,
  },
  {
    id: 'hw3',
    title: { en: 'English Essay', kn: 'ಇಂಗ್ಲಿಷ್ ಪ್ರಬಂಧ' },
    detail: { en: 'My Favourite Place', kn: 'ನನ್ನ ಮೆಚ್ಚಿನ ಸ್ಥಳ' },
    subject: 'english',
    due: 'later',
    dueLabel: { en: '12 Oct', kn: '12 ಅಕ್ಟೋ' },
    done: false,
  },
  {
    id: 'hw4',
    title: { en: 'Social Science Project', kn: 'ಸಮಾಜ ವಿಜ್ಞಾನ ಯೋಜನೆ' },
    detail: { en: 'Our Local Government', kn: 'ನಮ್ಮ ಸ್ಥಳೀಯ ಸರ್ಕಾರ' },
    subject: 'social-science',
    due: 'later',
    dueLabel: { en: '15 Oct', kn: '15 ಅಕ್ಟೋ' },
    project: true,
    done: false,
  },
  {
    id: 'hw5',
    title: { en: 'Kannada Spelling List', kn: 'ಕನ್ನಡ ಕಾಗುಣಿತ ಪಟ್ಟಿ' },
    detail: { en: 'Lesson 3 words', kn: 'ಪಾಠ 3 ಪದಗಳು' },
    subject: 'kannada',
    due: 'later',
    dueLabel: { en: '17 Oct', kn: '17 ಅಕ್ಟೋ' },
    done: true,
  },
  {
    id: 'hw6',
    title: { en: 'Scratch Animation', kn: 'ಸ್ಕ್ರ್ಯಾಚ್ ಅನಿಮೇಷನ್' },
    detail: { en: 'Make a sprite dance', kn: 'ಸ್ಪ್ರೈಟ್ ನೃತ್ಯ ಮಾಡಿಸಿ' },
    subject: 'computer-science',
    due: 'done',
    dueLabel: { en: '5 Oct', kn: '5 ಅಕ್ಟೋ' },
    done: true,
  },
]

export const weeklyGoals = [
  { id: 'g1', label: { en: 'Complete Math revision', kn: 'ಗಣಿತ ಪುನರಾವರ್ತನೆ ಪೂರ್ಣಗೊಳಿಸಿ' }, done: true },
  { id: 'g2', label: { en: 'Read 2 English chapters', kn: '2 ಇಂಗ್ಲಿಷ್ ಅಧ್ಯಾಯ ಓದಿ' }, done: true },
  { id: 'g3', label: { en: 'Finish Science worksheet', kn: 'ವಿಜ್ಞಾನ ಕಾರ್ಯಪತ್ರ ಮುಗಿಸಿ' }, done: true },
  { id: 'g4', label: { en: 'Practice Kannada spelling', kn: 'ಕನ್ನಡ ಕಾಗುಣಿತ ಅಭ್ಯಾಸ' }, done: false },
  { id: 'g5', label: { en: 'Take a mock test', kn: 'ಅಣಕು ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ' }, done: false },
]

export const announcements = [
  {
    id: 'a1',
    title: { en: 'Dasara Holiday Notice', kn: 'ದಸರಾ ರಜೆ ಸೂಚನೆ' },
    body: { en: 'School will be closed from Oct 10 – Oct 15, 2024.', kn: 'ಅಕ್ಟೋ 10 – ಅಕ್ಟೋ 15, 2024 ರವರೆಗೆ ಶಾಲೆಗೆ ರಜೆ.' },
    time: { en: '2 hours ago', kn: '2 ಗಂಟೆಗಳ ಹಿಂದೆ' },
    important: true,
    icon: 'bell',
    category: 'holiday',
  },
  {
    id: 'a2',
    title: { en: 'Inter-School Science Fair', kn: 'ಅಂತರ-ಶಾಲಾ ವಿಜ್ಞಾನ ಮೇಳ' },
    body: { en: 'Registrations open for Classes 6–10.', kn: '6–10ನೇ ತರಗತಿಗಳಿಗೆ ನೋಂದಣಿ ಆರಂಭ.' },
    time: { en: '1 day ago', kn: '1 ದಿನದ ಹಿಂದೆ' },
    important: false,
    icon: 'trophy',
    category: 'event',
  },
  {
    id: 'a3',
    title: { en: 'New Library Books', kn: 'ಹೊಸ ಗ್ರಂಥಾಲಯ ಪುಸ್ತಕಗಳು' },
    body: { en: 'Explore 50+ new books in our school library!', kn: 'ನಮ್ಮ ಶಾಲಾ ಗ್ರಂಥಾಲಯದಲ್ಲಿ 50+ ಹೊಸ ಪುಸ್ತಕಗಳು!' },
    time: { en: '3 days ago', kn: '3 ದಿನಗಳ ಹಿಂದೆ' },
    important: false,
    icon: 'book',
    category: 'library',
  },
  {
    id: 'a4',
    title: { en: 'Parent–Teacher Meeting', kn: 'ಪೋಷಕ–ಶಿಕ್ಷಕ ಸಭೆ' },
    body: { en: 'PTM for Class 7 on Saturday, Oct 19 at 10:00 AM.', kn: '7ನೇ ತರಗತಿಯ ಸಭೆ ಶನಿವಾರ, ಅಕ್ಟೋ 19 ಬೆಳಿಗ್ಗೆ 10:00ಕ್ಕೆ.' },
    time: { en: '5 days ago', kn: '5 ದಿನಗಳ ಹಿಂದೆ' },
    important: true,
    icon: 'users',
    category: 'event',
  },
  {
    id: 'a5',
    title: { en: 'Kannada Rajyotsava Celebrations', kn: 'ಕನ್ನಡ ರಾಜ್ಯೋತ್ಸವ ಆಚರಣೆ' },
    body: { en: 'Cultural programme on Nov 1. Sign up for performances with your class teacher.', kn: 'ನವೆಂಬರ್ 1 ರಂದು ಸಾಂಸ್ಕೃತಿಕ ಕಾರ್ಯಕ್ರಮ. ನಿಮ್ಮ ತರಗತಿ ಶಿಕ್ಷಕರಲ್ಲಿ ಹೆಸರು ನೋಂದಾಯಿಸಿ.' },
    time: { en: '1 week ago', kn: '1 ವಾರದ ಹಿಂದೆ' },
    important: false,
    icon: 'flag',
    category: 'event',
  },
]

export const exams = [
  { id: 'e1', subject: 'mathematics', name: { en: 'Unit Test', kn: 'ಘಟಕ ಪರೀಕ್ಷೆ' }, date: { en: 'Thu, 31 Oct', kn: 'ಗುರು, 31 ಅಕ್ಟೋ' }, inDays: 6, syllabus: { en: 'Chapters 4–6', kn: 'ಅಧ್ಯಾಯ 4–6' } },
  { id: 'e2', subject: 'science', name: { en: 'Unit Test', kn: 'ಘಟಕ ಪರೀಕ್ಷೆ' }, date: { en: 'Mon, 4 Nov', kn: 'ಸೋಮ, 4 ನವೆಂ' }, inDays: 10, syllabus: { en: 'Heat; Force and Motion', kn: 'ಉಷ್ಣ; ಬಲ ಮತ್ತು ಚಲನೆ' } },
  { id: 'e3', subject: 'english', name: { en: 'Reading Assessment', kn: 'ಓದುವ ಮೌಲ್ಯಮಾಪನ' }, date: { en: 'Fri, 8 Nov', kn: 'ಶುಕ್ರ, 8 ನವೆಂ' }, inDays: 14, syllabus: { en: 'Unseen passage', kn: 'ಅಪರಿಚಿತ ಗದ್ಯಭಾಗ' } },
]

export const results = [
  { subject: 'mathematics', name: { en: 'Formative Assessment 1', kn: 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1' }, score: 42, max: 50 },
  { subject: 'science', name: { en: 'Formative Assessment 1', kn: 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1' }, score: 38, max: 50 },
  { subject: 'english', name: { en: 'Formative Assessment 1', kn: 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1' }, score: 45, max: 50 },
  { subject: 'social-science', name: { en: 'Formative Assessment 1', kn: 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1' }, score: 40, max: 50 },
  { subject: 'kannada', name: { en: 'Formative Assessment 1', kn: 'ರಚನಾತ್ಮಕ ಮೌಲ್ಯಮಾಪನ 1' }, score: 36, max: 50 },
]

// Mock test questions (Mathematics – Algebra).
export const mockTest = [
  {
    q: { en: 'Simplify: 3x + 5x', kn: 'ಸರಳೀಕರಿಸಿ: 3x + 5x' },
    options: ['8x', '15x', '8x²', '2x'],
    answer: 0,
  },
  {
    q: { en: 'If x = 4, what is 2x + 3?', kn: 'x = 4 ಆದರೆ, 2x + 3 ಎಷ್ಟು?' },
    options: ['9', '11', '14', '7'],
    answer: 1,
  },
  {
    q: { en: 'How many terms are in 4a + 3b − 7?', kn: '4a + 3b − 7 ರಲ್ಲಿ ಎಷ್ಟು ಪದಗಳಿವೆ?' },
    options: ['1', '2', '3', '4'],
    answer: 2,
  },
  {
    q: { en: 'The coefficient of y in −6y is', kn: '−6y ನಲ್ಲಿ y ಯ ಸಹಗುಣಕ' },
    options: ['6', 'y', '−6', '−y'],
    answer: 2,
  },
  {
    q: { en: 'Solve: x − 7 = 12', kn: 'ಬಿಡಿಸಿ: x − 7 = 12' },
    options: ['5', '19', '−5', '84'],
    answer: 1,
  },
]

// Attendance for October: P = present, A = absent, H = holiday, W = weekend, '' = future.
export const attendanceMonth = {
  label: { en: 'October 2024', kn: 'ಅಕ್ಟೋಬರ್ 2024' },
  firstWeekday: 2, // Oct 1, 2024 was a Tuesday (0 = Sunday)
  days: [
    'P', 'P', 'P', 'P', 'W', 'W', 'P', 'P', 'P', 'H', 'H', 'H', 'W', 'H', 'H', 'P', 'A', 'P', 'W', 'W',
    'P', 'P', 'P', 'P', 'P', 'W', 'W', '', '', '', '',
  ],
}

export const attendanceHistory = [
  { month: { en: 'Jun', kn: 'ಜೂನ್' }, pct: 95 },
  { month: { en: 'Jul', kn: 'ಜುಲೈ' }, pct: 90 },
  { month: { en: 'Aug', kn: 'ಆಗ' }, pct: 94 },
  { month: { en: 'Sep', kn: 'ಸೆಪ್ಟೆಂ' }, pct: 88 },
  { month: { en: 'Oct', kn: 'ಅಕ್ಟೋ' }, pct: 92 },
]

export const weeklyStudy = [
  { day: { en: 'Mon', kn: 'ಸೋಮ' }, mins: 45 },
  { day: { en: 'Tue', kn: 'ಮಂಗಳ' }, mins: 60 },
  { day: { en: 'Wed', kn: 'ಬುಧ' }, mins: 30 },
  { day: { en: 'Thu', kn: 'ಗುರು' }, mins: 75 },
  { day: { en: 'Fri', kn: 'ಶುಕ್ರ' }, mins: 50 },
  { day: { en: 'Sat', kn: 'ಶನಿ' }, mins: 90 },
  { day: { en: 'Sun', kn: 'ಭಾನು' }, mins: 40 },
]

export const badges = [
  { icon: '🔥', label: { en: '7-day streak', kn: '7 ದಿನಗಳ ಸರಣಿ' } },
  { icon: '🧮', label: { en: 'Algebra Explorer', kn: 'ಬೀಜಗಣಿತ ಅನ್ವೇಷಕ' } },
  { icon: '📚', label: { en: 'Bookworm', kn: 'ಪುಸ್ತಕ ಪ್ರೇಮಿ' } },
  { icon: '⏰', label: { en: 'Always On Time', kn: 'ಸಮಯಪಾಲಕ' } },
]

export const notifications = [
  { id: 'n1', text: { en: 'Mathematics homework is due today', kn: 'ಗಣಿತ ಮನೆಗೆಲಸ ಇಂದು ಸಲ್ಲಿಸಬೇಕು' }, time: { en: '10 min ago', kn: '10 ನಿಮಿಷಗಳ ಹಿಂದೆ' }, to: '/homework' },
  { id: 'n2', text: { en: 'New announcement: Dasara Holiday Notice', kn: 'ಹೊಸ ಪ್ರಕಟಣೆ: ದಸರಾ ರಜೆ ಸೂಚನೆ' }, time: { en: '2 hours ago', kn: '2 ಗಂಟೆಗಳ ಹಿಂದೆ' }, to: '/announcements' },
  { id: 'n3', text: { en: 'Your AI coach made a Math revision plan', kn: 'ನಿಮ್ಮ AI ತರಬೇತುದಾರ ಗಣಿತ ಯೋಜನೆ ಸಿದ್ಧಪಡಿಸಿದೆ' }, time: { en: 'Yesterday', kn: 'ನಿನ್ನೆ' }, to: '/ai-tutor' },
]

export const revisionPlan = [
  { day: { en: 'Day 1', kn: 'ದಿನ 1' }, task: { en: 'Revise Ch 4 – Simple Equations (20 min)', kn: 'ಅಧ್ಯಾಯ 4 ಪುನರಾವರ್ತನೆ – ಸರಳ ಸಮೀಕರಣ (20 ನಿಮಿಷ)' } },
  { day: { en: 'Day 2', kn: 'ದಿನ 2' }, task: { en: 'Ch 5 – Like & unlike terms, 10 practice questions', kn: 'ಅಧ್ಯಾಯ 5 – ಸಜಾತೀಯ ಪದಗಳು, 10 ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು' } },
  { day: { en: 'Day 3', kn: 'ದಿನ 3' }, task: { en: 'Ch 6 – Lines and Angles basics (25 min)', kn: 'ಅಧ್ಯಾಯ 6 – ರೇಖೆ ಮತ್ತು ಕೋನಗಳ ಮೂಲಗಳು (25 ನಿಮಿಷ)' } },
  { day: { en: 'Day 4', kn: 'ದಿನ 4' }, task: { en: 'Mixed practice: 15 questions from Ch 4–6', kn: 'ಮಿಶ್ರ ಅಭ್ಯಾಸ: ಅಧ್ಯಾಯ 4–6 ರಿಂದ 15 ಪ್ರಶ್ನೆಗಳು' } },
  { day: { en: 'Day 5', kn: 'ದಿನ 5' }, task: { en: 'Take the Algebra mock test', kn: 'ಬೀಜಗಣಿತ ಅಣಕು ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ' } },
]
