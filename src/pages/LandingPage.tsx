import { useRef, lazy, Suspense } from 'react';
import { useNavigate } from 'react-router-dom';
import { motion, useScroll, useTransform, useInView } from 'framer-motion';
import {
  GraduationCap,
  CalendarCheck,
  FileText,
  Shield,
  Zap,
  Users,
  Trophy,
  ArrowRight,
  Star,
  Clock,
  BookOpen,
  AlertTriangle,
  ChevronDown,
} from 'lucide-react';

const GlassOrb = lazy(() => import('../components/three/GlassOrb'));

/* ── helpers ──────────────────────────────────────────────────────────────── */

function useSectionRef(threshold = 0.2) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: threshold });
  return { ref, inView };
}

const fadeUp = {
  hidden: { opacity: 0, y: 60 },
  visible: (i: number) => ({
    opacity: 1,
    y: 0,
    transition: { duration: 0.7, delay: i * 0.12, ease: [0.22, 1, 0.36, 1] as const },
  }),
};

const staggerContainer = {
  hidden: {},
  visible: { transition: { staggerChildren: 0.1 } },
};

/* ── 3D fallback for mobile / loading ────────────────────────────────────── */

function OrbFallback() {
  return (
    <div className="w-full h-full flex items-center justify-center">
      <div className="w-48 h-48 md:w-72 md:h-72 rounded-full bg-gradient-to-br from-indigo-500/20 via-purple-500/20 to-blue-500/20 blur-3xl animate-pulse" />
    </div>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SECTION 1 — HERO                                                         */
/* ════════════════════════════════════════════════════════════════════════════ */

function Hero() {
  const navigate = useNavigate();
  const { scrollY } = useScroll();
  const opacity = useTransform(scrollY, [0, 600], [1, 0]);
  const scale = useTransform(scrollY, [0, 600], [1, 0.92]);

  return (
    <section className="relative min-h-screen flex items-center justify-center overflow-hidden">
      {/* Ambient gradient blobs */}
      <div className="absolute inset-0 pointer-events-none overflow-hidden">
        <div className="absolute -top-1/4 -left-1/4 w-[80vw] h-[80vw] rounded-full bg-indigo-600/8 blur-[160px]" />
        <div className="absolute -bottom-1/4 -right-1/4 w-[60vw] h-[60vw] rounded-full bg-purple-600/8 blur-[140px]" />
      </div>

      {/* 3D Object — hidden on mobile for performance */}
      <motion.div style={{ opacity, scale }} className="absolute inset-0 z-0">
        <div className="hidden md:block w-full h-full">
          <Suspense fallback={<OrbFallback />}>
            <GlassOrb />
          </Suspense>
        </div>
        {/* Mobile fallback */}
        <div className="md:hidden w-full h-full flex items-center justify-center">
          <OrbFallback />
        </div>
      </motion.div>

      {/* Hero content */}
      <div className="relative z-10 max-w-5xl mx-auto px-6 text-center pt-24 pb-20">
        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <div className="inline-flex items-center gap-2 bg-white/5 border border-white/10 rounded-full px-4 py-1.5 mb-8">
            <GraduationCap className="w-4 h-4 text-indigo-400" />
            <span className="text-xs font-semibold text-gray-300 tracking-wide uppercase">Built for NIIT University</span>
          </div>
        </motion.div>

        <motion.h1
          initial={{ opacity: 0, y: 50 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 1, delay: 0.15, ease: [0.22, 1, 0.36, 1] }}
          className="text-5xl sm:text-7xl md:text-8xl lg:text-9xl font-black tracking-tighter leading-[0.9] text-white mb-6"
        >
          Take Control
          <br />
          <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
            of Your Semester
          </span>
        </motion.h1>

        <motion.p
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.35, ease: [0.22, 1, 0.36, 1] }}
          className="text-lg md:text-xl text-gray-400 max-w-2xl mx-auto mb-10 leading-relaxed"
        >
          Attendance tracking. Verified notes. Real-time timetables.
          <br className="hidden sm:block" />
          Everything your semester needs, in one place.
        </motion.p>

        <motion.div
          initial={{ opacity: 0, y: 30 }}
          animate={{ opacity: 1, y: 0 }}
          transition={{ duration: 0.8, delay: 0.5, ease: [0.22, 1, 0.36, 1] }}
          className="flex items-center justify-center"
        >
          <button
            onClick={() => navigate('/intro')}
            className="group relative px-8 py-4 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-base rounded-2xl transition-all duration-300 shadow-lg shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-95 flex items-center gap-2"
          >
            Start Your Semester
            <ArrowRight className="w-4 h-4 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>

        {/* Trust badges */}
        <motion.div
          initial={{ opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ duration: 1, delay: 0.8 }}
          className="mt-16 flex items-center justify-center gap-6 text-gray-500 text-xs font-medium"
        >
          <div className="flex items-center gap-1.5">
            <Shield className="w-3.5 h-3.5" />
            <span>Verified Content</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <Users className="w-3.5 h-3.5" />
            <span>Peer-Reviewed</span>
          </div>
          <div className="w-1 h-1 rounded-full bg-gray-600" />
          <div className="flex items-center gap-1.5">
            <Zap className="w-3.5 h-3.5" />
            <span>Real-Time Updates</span>
          </div>
        </motion.div>
      </div>

      {/* Scroll indicator */}
      <motion.div
        animate={{ y: [0, 8, 0] }}
        transition={{ duration: 2, repeat: Infinity }}
        className="absolute bottom-8 left-1/2 -translate-x-1/2"
      >
        <ChevronDown className="w-5 h-5 text-gray-500" />
      </motion.div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SECTION 2 — THE PROBLEM (scroll-reveal text)                             */
/* ════════════════════════════════════════════════════════════════════════════ */

const problemLines = [
  { text: 'Managing 75% attendance.', icon: CalendarCheck, color: 'text-red-400' },
  { text: 'Hunting for notes across 12 groups.', icon: FileText, color: 'text-amber-400' },
  { text: 'Missing assignment deadlines.', icon: Clock, color: 'text-orange-400' },
  { text: 'The system is broken.', icon: AlertTriangle, color: 'text-white' },
];

function ProblemLine({ text, icon: Icon, color, index }: { text: string; icon: React.ComponentType<{ className?: string }>; color: string; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.5 });

  return (
    <motion.div
      ref={ref}
      initial={{ opacity: 0, x: -60 }}
      animate={inView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      className="flex items-center gap-4 md:gap-6"
    >
      <Icon className={`w-6 h-6 md:w-8 md:h-8 ${color} shrink-0`} />
      <span className={`text-2xl sm:text-3xl md:text-5xl lg:text-6xl font-black tracking-tight ${color}`}>
        {text}
      </span>
    </motion.div>
  );
}

function Problem() {
  const { ref, inView } = useSectionRef(0.15);

  return (
    <section id="problem" ref={ref} className="relative py-32 md:py-44 overflow-hidden">
      {/* Red ambient glow */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[60vw] h-[40vw] rounded-full bg-red-600/5 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-5xl mx-auto px-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-red-400 mb-12"
        >
          The Problem
        </motion.p>

        <div className="space-y-6 md:space-y-8">
          {problemLines.map((line, i) => (
            <ProblemLine key={i} {...line} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SECTION 3 — THE SOLUTION (floating UI cards, parallax)                   */
/* ════════════════════════════════════════════════════════════════════════════ */

const solutionCards = [
  {
    title: 'Attendance Tracker',
    description: 'Track every lecture. Never miss a threshold.',
    gradient: 'from-emerald-500/20 to-teal-500/20',
    icon: CalendarCheck,
    iconColor: 'text-emerald-400',
  },
  {
    title: 'Verified Notes Vault',
    description: 'Peer-reviewed study materials you can trust.',
    gradient: 'from-indigo-500/20 to-purple-500/20',
    icon: BookOpen,
    iconColor: 'text-indigo-400',
  },
  {
    title: 'Real-Time Timetable',
    description: 'Live schedule sync. Never walk into the wrong room.',
    gradient: 'from-blue-500/20 to-cyan-500/20',
    icon: Clock,
    iconColor: 'text-blue-400',
  },
  {
    title: 'Karma System',
    description: 'Earn points for contributing. Climb the leaderboard.',
    gradient: 'from-amber-500/20 to-orange-500/20',
    icon: Trophy,
    iconColor: 'text-amber-400',
  },
];

function FloatingCard({
  card,
  index,
}: {
  card: (typeof solutionCards)[number];
  index: number;
}) {
  const ref = useRef<HTMLDivElement>(null);
  const { scrollYProgress } = useScroll({
    target: ref,
    offset: ['start end', 'end start'],
  });

  const y = useTransform(scrollYProgress, [0, 1], [80, -80]);
  const refInView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      style={{ y }}
      initial={{ opacity: 0, x: index % 2 === 0 ? -80 : 80 }}
      animate={refInView ? { opacity: 1, x: 0 } : {}}
      transition={{ duration: 0.8, delay: index * 0.15, ease: [0.22, 1, 0.36, 1] }}
      className={`glass rounded-3xl p-6 md:p-8 ${index % 2 === 0 ? 'md:ml-0 md:mr-12' : 'md:ml-12 md:mr-0'}`}
    >
      <div className={`w-12 h-12 rounded-2xl bg-gradient-to-br ${card.gradient} flex items-center justify-center mb-4`}>
        <card.icon className={`w-6 h-6 ${card.iconColor}`} />
      </div>
      <h3 className="text-xl md:text-2xl font-bold text-white mb-2">{card.title}</h3>
      <p className="text-gray-400 text-sm md:text-base leading-relaxed">{card.description}</p>
    </motion.div>
  );
}

function Solution() {
  const { ref, inView } = useSectionRef(0.1);

  return (
    <section ref={ref} className="relative py-32 md:py-44 overflow-hidden">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute top-1/3 right-0 w-[50vw] h-[50vw] rounded-full bg-indigo-600/5 blur-[140px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-indigo-400 mb-6"
        >
          The Solution
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-white mb-16 leading-tight"
        >
          One app to replace
          <br />
          <span className="text-gray-500">the chaos.</span>
        </motion.h2>

        <div className="space-y-8 md:space-y-12">
          {solutionCards.map((card, i) => (
            <FloatingCard key={i} card={card} index={i} />
          ))}
        </div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SECTION 4 — BENEFITS (Bento Grid)                                        */
/* ════════════════════════════════════════════════════════════════════════════ */

const bentoItems = [
  {
    title: 'Karma Points',
    description: 'Earn recognition for every verified upload. Compete with classmates.',
    icon: Star,
    color: 'text-amber-400',
    gradient: 'from-amber-500/10 to-orange-500/10',
    span: 'col-span-1 md:col-span-2',
  },
  {
    title: 'Mass Bunk Protection',
    description: 'Get alerts when a class cancellation could impact your attendance.',
    icon: Shield,
    color: 'text-emerald-400',
    gradient: 'from-emerald-500/10 to-teal-500/10',
    span: 'col-span-1',
  },
  {
    title: 'Real-Time Sync',
    description: 'Timetable, attendance, and notes update the moment they drop.',
    icon: Zap,
    color: 'text-blue-400',
    gradient: 'from-blue-500/10 to-cyan-500/10',
    span: 'col-span-1',
  },
  {
    title: 'Peer-Reviewed Notes',
    description: 'Only verified, high-quality notes reach your dashboard. No spam.',
    icon: FileText,
    color: 'text-indigo-400',
    gradient: 'from-indigo-500/10 to-purple-500/10',
    span: 'col-span-1 md:col-span-2',
  },
  {
    title: 'Classroom View',
    description: 'See who is in your branch. Find study partners. Build connections.',
    icon: Users,
    color: 'text-purple-400',
    gradient: 'from-purple-500/10 to-pink-500/10',
    span: 'col-span-1',
  },
  {
    title: 'Smart Deadlines',
    description: 'Never miss a submission. Auto-tracked deadlines with reminders.',
    icon: Clock,
    color: 'text-cyan-400',
    gradient: 'from-cyan-500/10 to-sky-500/10',
    span: 'col-span-1',
  },
];

function BentoCard({ item, index }: { item: (typeof bentoItems)[number]; index: number }) {
  const ref = useRef<HTMLDivElement>(null);
  const inView = useInView(ref, { once: true, amount: 0.3 });

  return (
    <motion.div
      ref={ref}
      variants={fadeUp}
      initial="hidden"
      animate={inView ? 'visible' : 'hidden'}
      custom={index}
      className={`${item.span} glass rounded-3xl p-6 md:p-8 hover:bg-white/[0.08] transition-colors duration-500 group`}
    >
      <div className={`w-11 h-11 rounded-2xl bg-gradient-to-br ${item.gradient} flex items-center justify-center mb-4 group-hover:scale-110 transition-transform duration-300`}>
        <item.icon className={`w-5 h-5 ${item.color}`} />
      </div>
      <h3 className="text-lg md:text-xl font-bold text-white mb-2">{item.title}</h3>
      <p className="text-gray-400 text-sm leading-relaxed">{item.description}</p>
    </motion.div>
  );
}

function Benefits() {
  const { ref, inView } = useSectionRef(0.1);

  return (
    <section ref={ref} className="relative py-32 md:py-44">
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/4 w-[50vw] h-[40vw] rounded-full bg-purple-600/5 blur-[120px]" />
      </div>

      <div className="relative z-10 max-w-6xl mx-auto px-6">
        <motion.p
          initial={{ opacity: 0 }}
          animate={inView ? { opacity: 1 } : {}}
          transition={{ duration: 0.6 }}
          className="text-xs font-bold uppercase tracking-[0.2em] text-purple-400 mb-6"
        >
          Benefits
        </motion.p>
        <motion.h2
          initial={{ opacity: 0, y: 30 }}
          animate={inView ? { opacity: 1, y: 0 } : {}}
          transition={{ duration: 0.8, delay: 0.1 }}
          className="text-3xl sm:text-4xl md:text-6xl font-black tracking-tight text-white mb-16 leading-tight"
        >
          Everything you need.
          <br />
          <span className="text-gray-500">Nothing you don't.</span>
        </motion.h2>

        <motion.div
          variants={staggerContainer}
          initial="hidden"
          animate={inView ? 'visible' : 'hidden'}
          className="grid grid-cols-1 md:grid-cols-3 gap-4 md:gap-5"
        >
          {bentoItems.map((item, i) => (
            <BentoCard key={i} item={item} index={i} />
          ))}
        </motion.div>
      </div>
    </section>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  SECTION 5 — FINAL CTA + FOOTER                                           */
/* ════════════════════════════════════════════════════════════════════════════ */

function FinalCTA() {
  const navigate = useNavigate();
  const { ref, inView } = useSectionRef(0.3);

  return (
    <section ref={ref} className="relative py-32 md:py-44 overflow-hidden">
      {/* Gradient wash */}
      <div className="absolute inset-0 pointer-events-none">
        <div className="absolute bottom-0 left-1/2 -translate-x-1/2 w-[80vw] h-[50vw] rounded-full bg-indigo-600/8 blur-[160px]" />
      </div>

      <div className="relative z-10 max-w-4xl mx-auto px-6 text-center">
        <motion.div
          initial={{ opacity: 0, scale: 0.9 }}
          animate={inView ? { opacity: 1, scale: 1 } : {}}
          transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
        >
          <h2 className="text-4xl sm:text-5xl md:text-7xl font-black tracking-tight text-white mb-6 leading-[1.05]">
            Upgrade your
            <br />
            <span className="bg-gradient-to-r from-indigo-400 via-purple-400 to-blue-400 bg-clip-text text-transparent">
              academic life.
            </span>
          </h2>
          <p className="text-lg text-gray-400 max-w-xl mx-auto mb-10">
            Join your classmates already using SemSav to stay on top of every semester.
          </p>

          <button
            onClick={() => navigate('/intro')}
            className="group relative inline-flex items-center gap-3 px-10 py-5 bg-indigo-600 hover:bg-indigo-500 text-white font-bold text-lg rounded-2xl transition-all duration-300 shadow-xl shadow-indigo-500/25 hover:shadow-indigo-500/40 active:scale-95"
          >
            <GraduationCap className="w-5 h-5" />
            Start Your Semester
            <ArrowRight className="w-5 h-5 group-hover:translate-x-1 transition-transform" />
          </button>
        </motion.div>
      </div>
    </section>
  );
}

function Footer() {
  return (
    <footer className="border-t border-white/5 py-10">
      <div className="max-w-6xl mx-auto px-6 flex flex-col md:flex-row items-center justify-between gap-4">
        <div className="flex items-center gap-2">
          <GraduationCap className="w-5 h-5 text-indigo-400" />
          <span className="text-sm font-bold text-white">SemSav</span>
          <span className="text-xs text-gray-500 ml-1">v2.0</span>
        </div>
        <p className="text-xs text-gray-500">
          Built with care for NIIT University students.
        </p>
      </div>
    </footer>
  );
}

/* ════════════════════════════════════════════════════════════════════════════ */
/*  MAIN EXPORT                                                               */
/* ════════════════════════════════════════════════════════════════════════════ */

export default function LandingPage() {
  return (
    <div className="min-h-screen bg-[#09090b] text-white overflow-x-hidden">
      {/* Top gradient line */}
      <div className="fixed top-0 left-0 right-0 h-px bg-gradient-to-r from-transparent via-indigo-500/50 to-transparent z-50" />

      <Hero />
      <Problem />
      <Solution />
      <Benefits />
      <FinalCTA />
      <Footer />
    </div>
  );
}
