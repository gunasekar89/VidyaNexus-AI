import {
  AICoach,
  Announcements,
  ContinueLearning,
  HeroBanner,
  MobileClasses,
  MobileHero,
  MobileStats,
  StatCards,
  Timetable,
  UpcomingTasks,
  WeeklyGoal,
} from '../components/dashboard'

export default function Dashboard() {
  return (
    <div className="space-y-4">
      <HeroBanner />
      <MobileHero />
      <StatCards />
      <MobileStats />
      <MobileClasses />
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.86fr_1fr_1fr]">
        <div className="hidden min-w-0 lg:block">
          <Timetable />
        </div>
        <ContinueLearning />
        <AICoach />
      </div>
      <div className="grid grid-cols-1 gap-4 lg:grid-cols-[0.86fr_0.84fr_1.16fr]">
        <UpcomingTasks />
        <WeeklyGoal />
        <Announcements />
      </div>
    </div>
  )
}
