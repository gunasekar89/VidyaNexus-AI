// Static school catalogue shared by the web app and the API server: subjects,
// chapters, timetable, the built-in mock test and badge definitions.
// Everything carries English and Kannada text for the EN / ಕನ್ನಡ toggle.
// Per-student data (homework, goals, attendance, ...) lives in the database.

// Default profile for the seeded demo student.
export const demoStudent = {
  name: 'Jason',
  firstName: { en: 'Jason', kn: 'ಜೇಸನ್' },
  className: { en: 'Class 7A', kn: '7ನೇ ತರಗತಿ ಎ' },
  rollNo: '07A-18',
  school: { en: 'Vidya Public School, Bengaluru', kn: 'ವಿದ್ಯಾ ಪಬ್ಲಿಕ್ ಶಾಲೆ, ಬೆಂಗಳೂರು' },
  email: 'jason@vidyanexus.school',
  guardian: 'Suresh K.',
  phone: '+91 98450 12345',
}

export const subjects = [
  {
    id: 'mathematics',
    name: { en: 'Mathematics', kn: 'ಗಣಿತ' },
    topic: { en: 'Algebra · Chapter 5', kn: 'ಬೀಜಗಣಿತ · ಅಧ್ಯಾಯ 5' },
    icon: 'pi',
    color: 'orange',
    teacher: 'Dola Ramesh',
    chapters: [
      { en: 'Integers', kn: 'ಪೂರ್ಣಾಂಕಗಳು' },
      { en: 'Fractions and Decimals', kn: 'ಭಿನ್ನರಾಶಿ ಮತ್ತು ದಶಮಾಂಶ' },
      { en: 'Data Handling', kn: 'ದತ್ತಾಂಶ ನಿರ್ವಹಣೆ' },
      { en: 'Simple Equations', kn: 'ಸರಳ ಸಮೀಕರಣಗಳು' },
      { en: 'Algebraic Expressions', kn: 'ಬೀಜಗಣಿತೀಯ ಅಭಿವ್ಯಕ್ತಿಗಳು' },
      { en: 'Lines and Angles', kn: 'ರೇಖೆಗಳು ಮತ್ತು ಕೋನಗಳು' },
    ],
  },
  {
    id: 'science',
    name: { en: 'Science', kn: 'ವಿಜ್ಞಾನ' },
    topic: { en: 'Force and Motion', kn: 'ಬಲ ಮತ್ತು ಚಲನೆ' },
    icon: 'flask',
    color: 'blue',
    teacher: 'Mr. Arun P.',
    chapters: [
      { en: 'Nutrition in Plants', kn: 'ಸಸ್ಯಗಳಲ್ಲಿ ಪೋಷಣೆ' },
      { en: 'Heat', kn: 'ಉಷ್ಣ' },
      { en: 'Acids, Bases and Salts', kn: 'ಆಮ್ಲ, ಪ್ರತ್ಯಾಮ್ಲ ಮತ್ತು ಲವಣ' },
      { en: 'Force and Motion', kn: 'ಬಲ ಮತ್ತು ಚಲನೆ' },
      { en: 'Electric Current', kn: 'ವಿದ್ಯುತ್ ಪ್ರವಾಹ' },
    ],
  },
  {
    id: 'english',
    name: { en: 'English', kn: 'ಇಂಗ್ಲಿಷ್' },
    topic: { en: 'Prose & Comprehension', kn: 'ಗದ್ಯ ಮತ್ತು ಗ್ರಹಿಕೆ' },
    icon: 'book',
    color: 'green',
    teacher: 'Ms. Priya D.',
    chapters: [
      { en: 'Three Questions', kn: 'ಮೂರು ಪ್ರಶ್ನೆಗಳು' },
      { en: 'A Gift of Chappals', kn: 'ಚಪ್ಪಲಿಗಳ ಉಡುಗೊರೆ' },
      { en: 'Gopal and the Hilsa Fish', kn: 'ಗೋಪಾಲ ಮತ್ತು ಹಿಲ್ಸಾ ಮೀನು' },
      { en: 'The Ashes That Made Trees Bloom', kn: 'ಮರಗಳನ್ನು ಅರಳಿಸಿದ ಬೂದಿ' },
    ],
  },
  {
    id: 'social-science',
    name: { en: 'Social Science', kn: 'ಸಮಾಜ ವಿಜ್ಞಾನ' },
    topic: { en: 'Our Constitution', kn: 'ನಮ್ಮ ಸಂವಿಧಾನ' },
    icon: 'globe',
    color: 'amber',
    teacher: 'Mr. Mohan G.',
    chapters: [
      { en: 'Tracing Changes', kn: 'ಬದಲಾವಣೆಗಳ ಅನ್ವೇಷಣೆ' },
      { en: 'Environment', kn: 'ಪರಿಸರ' },
      { en: 'Our Constitution', kn: 'ನಮ್ಮ ಸಂವಿಧಾನ' },
      { en: 'Our Local Government', kn: 'ನಮ್ಮ ಸ್ಥಳೀಯ ಸರ್ಕಾರ' },
    ],
  },
  {
    id: 'kannada',
    name: { en: 'Kannada', kn: 'ಕನ್ನಡ' },
    topic: { en: 'Poems · Lesson 3', kn: 'ಪದ್ಯಗಳು · ಪಾಠ 3' },
    icon: 'kannada',
    color: 'pink',
    teacher: 'Mrs. Shobha N.',
    chapters: [
      { en: 'Lesson 1', kn: 'ಪಾಠ 1' },
      { en: 'Lesson 2', kn: 'ಪಾಠ 2' },
      { en: 'Lesson 3 · Poems', kn: 'ಪಾಠ 3 · ಪದ್ಯಗಳು' },
    ],
  },
  {
    id: 'computer-science',
    name: { en: 'Computer Science', kn: 'ಕಂಪ್ಯೂಟರ್ ವಿಜ್ಞಾನ' },
    topic: { en: 'Intro to Scratch', kn: 'ಸ್ಕ್ರ್ಯಾಚ್ ಪರಿಚಯ' },
    icon: 'cpu',
    color: 'violet',
    teacher: 'Mr. Kiran V.',
    chapters: [
      { en: 'Computer Basics', kn: 'ಕಂಪ್ಯೂಟರ್ ಮೂಲಗಳು' },
      { en: 'Internet Safety', kn: 'ಅಂತರ್ಜಾಲ ಸುರಕ್ಷತೆ' },
      { en: 'Intro to Scratch', kn: 'ಸ್ಕ್ರ್ಯಾಚ್ ಪರಿಚಯ' },
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

// Badges are earned from real activity; the server works out which ones a student has.
export const badges = [
  { id: 'streak', icon: '🔥', label: { en: '7-day streak', kn: '7 ದಿನಗಳ ಸರಣಿ' }, hint: { en: 'Study 7 days in a row', kn: 'ಸತತ 7 ದಿನ ಅಧ್ಯಯನ ಮಾಡಿ' } },
  { id: 'algebra', icon: '🧮', label: { en: 'Algebra Explorer', kn: 'ಬೀಜಗಣಿತ ಅನ್ವೇಷಕ' }, hint: { en: 'Score 4 or more in a mock test', kn: 'ಅಣಕು ಪರೀಕ್ಷೆಯಲ್ಲಿ 4 ಅಥವಾ ಹೆಚ್ಚು ಅಂಕ ಪಡೆಯಿರಿ' } },
  { id: 'bookworm', icon: '📚', label: { en: 'Bookworm', kn: 'ಪುಸ್ತಕ ಪ್ರೇಮಿ' }, hint: { en: 'Finish 3 English chapters', kn: '3 ಇಂಗ್ಲಿಷ್ ಅಧ್ಯಾಯಗಳನ್ನು ಮುಗಿಸಿ' } },
  { id: 'ontime', icon: '⏰', label: { en: 'Always On Time', kn: 'ಸಮಯಪಾಲಕ' }, hint: { en: '90% attendance this month', kn: 'ಈ ತಿಂಗಳು 90% ಹಾಜರಾತಿ' } },
]

// Awards that teachers give students (prizes, competitions, recognition).
export const awardCategories = {
  academic: { icon: '📘', en: 'Academic', kn: 'ಶೈಕ್ಷಣಿಕ' },
  sports: { icon: '⚽', en: 'Sports', kn: 'ಕ್ರೀಡೆ' },
  arts: { icon: '🎨', en: 'Arts & culture', kn: 'ಕಲೆ ಮತ್ತು ಸಂಸ್ಕೃತಿ' },
  conduct: { icon: '🌟', en: 'Conduct & leadership', kn: 'ನಡತೆ ಮತ್ತು ನಾಯಕತ್ವ' },
  other: { icon: '🎖️', en: 'Other', kn: 'ಇತರೆ' },
}

// Ordered from smallest to biggest stage.
export const awardLevels = {
  class: { en: 'Class', kn: 'ತರಗತಿ' },
  school: { en: 'School', kn: 'ಶಾಲೆ' },
  district: { en: 'District', kn: 'ಜಿಲ್ಲೆ' },
  state: { en: 'State', kn: 'ರಾಜ್ಯ' },
  national: { en: 'National', kn: 'ರಾಷ್ಟ್ರೀಯ' },
}

export const awardMedals = {
  gold: { icon: '🥇', en: '1st place', kn: 'ಪ್ರಥಮ ಸ್ಥಾನ' },
  silver: { icon: '🥈', en: '2nd place', kn: 'ದ್ವಿತೀಯ ಸ್ಥಾನ' },
  bronze: { icon: '🥉', en: '3rd place', kn: 'ತೃತೀಯ ಸ್ಥಾನ' },
  special: { icon: '🏆', en: 'Special award', kn: 'ವಿಶೇಷ ಪ್ರಶಸ್ತಿ' },
  participation: { icon: '🎗️', en: 'Participation', kn: 'ಭಾಗವಹಿಸುವಿಕೆ' },
}

// Starter revision plan, used until the AI coach makes a personalised one.
export const defaultRevisionPlan = [
  { day: { en: 'Day 1', kn: 'ದಿನ 1' }, task: { en: 'Revise Ch 4 – Simple Equations (20 min)', kn: 'ಅಧ್ಯಾಯ 4 ಪುನರಾವರ್ತನೆ – ಸರಳ ಸಮೀಕರಣ (20 ನಿಮಿಷ)' } },
  { day: { en: 'Day 2', kn: 'ದಿನ 2' }, task: { en: 'Ch 5 – Like & unlike terms, 10 practice questions', kn: 'ಅಧ್ಯಾಯ 5 – ಸಜಾತೀಯ ಪದಗಳು, 10 ಅಭ್ಯಾಸ ಪ್ರಶ್ನೆಗಳು' } },
  { day: { en: 'Day 3', kn: 'ದಿನ 3' }, task: { en: 'Ch 6 – Lines and Angles basics (25 min)', kn: 'ಅಧ್ಯಾಯ 6 – ರೇಖೆ ಮತ್ತು ಕೋನಗಳ ಮೂಲಗಳು (25 ನಿಮಿಷ)' } },
  { day: { en: 'Day 4', kn: 'ದಿನ 4' }, task: { en: 'Mixed practice: 15 questions from Ch 4–6', kn: 'ಮಿಶ್ರ ಅಭ್ಯಾಸ: ಅಧ್ಯಾಯ 4–6 ರಿಂದ 15 ಪ್ರಶ್ನೆಗಳು' } },
  { day: { en: 'Day 5', kn: 'ದಿನ 5' }, task: { en: 'Take the Algebra mock test', kn: 'ಬೀಜಗಣಿತ ಅಣಕು ಪರೀಕ್ಷೆ ಬರೆಯಿರಿ' } },
]
