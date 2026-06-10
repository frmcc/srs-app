"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  CpuChipIcon,
  BookOpenIcon,
  CalendarDaysIcon,
  ChevronRightIcon,
  SparklesIcon,
  CheckCircleIcon,
  ClockIcon,
  ArrowPathIcon,
  DocumentTextIcon,
  DocumentDuplicateIcon,
  CheckIcon,
  ArrowLeftIcon,
  XMarkIcon,
  Bars3Icon,
  AcademicCapIcon,
  ChevronDownIcon,
  CloudArrowUpIcon,
  ExclamationTriangleIcon,
  PrinterIcon,
  TrashIcon,
  Cog8ToothIcon,
  BellIcon,
  BellSlashIcon
} from "@heroicons/react/24/outline";

import { useState, useEffect, useCallback } from "react";


const extractStudentQuiz = (rawQuizText: string) => {
  if (!rawQuizText) return "";
  const match = rawQuizText.match(/===STUDENT_QUIZ_START===([\s\S]*?)===STUDENT_QUIZ_END===/);
  return match ? match[1].trim() : rawQuizText;
};

const parseQuizTasks = (studentQuizText: string) => {
  if (!studentQuizText) return [];
  const chunks = studentQuizText.split(/(?=Aufgabe \d+)/i);
  const tasks: { id: string; header: string; label: string; questionText: string }[] = [];
  for (const chunk of chunks) {
    const trimmed = chunk.trim();
    if (trimmed.startsWith("Aufgabe") || /^[a-zA-Z]+ \d+/i.test(trimmed)) {
      const lines = trimmed.split("\n");
      const headerLine = lines[0];
      const taskNameMatch = headerLine.match(/Aufgabe \d+/i);
      const taskName = taskNameMatch ? taskNameMatch[0] : "Aufgabe";
      const label = headerLine.replace(/:\s*$/, "").trim();
      
      let cleanQuestionText = trimmed;
      if (cleanQuestionText.startsWith(headerLine)) {
        cleanQuestionText = cleanQuestionText.substring(headerLine.length).trim();
      }
      
      tasks.push({
        id: taskName.toLowerCase().replace(/\s+/g, ""),
        header: taskName + ":",
        label: label,
        questionText: cleanQuestionText
      });
    }
  }
  return tasks;
};

const formatItems = (data: any[]) => {
  if (!Array.isArray(data)) return [];
  
  const now = new Date();
  const todayUTC = new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), now.getUTCDate()));

  const formatted = data.map(item => {
    const dueDate = new Date(item.nextReviewDate);
    const itemDateUTC = new Date(Date.UTC(dueDate.getUTCFullYear(), dueDate.getUTCMonth(), dueDate.getUTCDate()));
    const isDue = itemDateUTC <= todayUTC;
    
    const formattedDate = `${dueDate.getUTCDate().toString().padStart(2, '0')}.${(dueDate.getUTCMonth() + 1).toString().padStart(2, '0')}.${dueDate.getUTCFullYear()}`;

    return {
      id: item.id,
      subject: item.subjectMain,
      topic: item.subjectSub,
      level: item.currentLevel,
      dueDate: isDue ? "Due Now" : formattedDate,
      isDue,
      semester: item.semester || 1,
      raw: item
    };
  });
  
  // Sort logic: Due items first, then group by module, then by urgency
  formatted.sort((a, b) => {
    if (a.isDue && !b.isDue) return -1;
    if (!a.isDue && b.isDue) return 1;
    
    const subjectCompare = a.subject.localeCompare(b.subject);
    if (subjectCompare !== 0) return subjectCompare;
    
    return new Date(a.raw.nextReviewDate).getTime() - new Date(b.raw.nextReviewDate).getTime();
  });

  return formatted;
};

export default function DashboardClient({ initialItems }: { initialItems: any[] }) {
  const [upcomingReviews, setUpcomingReviews] = useState<any[]>(initialItems ? formatItems(initialItems) : []);
  const [activeTab, setActiveTab] = useState("dashboard");
  const [isGenerating, setIsGenerating] = useState(false);
  const [progressStep, setProgressStep] = useState(0);
  const [progressMsg, setProgressMsg] = useState("");
  
  const [subjectInput, setSubjectInput] = useState("");
  const [topicInput, setTopicInput] = useState("");
  const [textInput, setTextInput] = useState("");
  const [uploadedFiles, setUploadedFiles] = useState<File[]>([]);
  const [isDragging, setIsDragging] = useState(false);
  
  // Semester & Settings State
  const [currentSemester, setCurrentSemester] = useState<number>(1);
  const [modulePresets, setModulePresets] = useState<string[]>([]);
  const [language, setLanguage] = useState<string>("german");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState("");
  
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCurrentSemester(data.currentSemester);
          setModulePresets(data.modulePresets || []);
          if (data.language) setLanguage(data.language);
          if (data.modulePresets && data.modulePresets.length > 0) {
            setSubjectInput(data.modulePresets[0]);
          }
        }
      })
      .catch(console.error);
  }, []);

  // Quiz taking state
  const [selectedReview, setSelectedReview] = useState<any>(null);
  const [studentAnswers, setStudentAnswers] = useState("");
  const [parsedTasks, setParsedTasks] = useState<any[]>([]);
  const [individualAnswers, setIndividualAnswers] = useState<Record<string, string>>({});
  const [isGrading, setIsGrading] = useState(false);
  const [showAllScheduled, setShowAllScheduled] = useState(false);
  const [gradingStep, setGradingStep] = useState(0);
  const [gradingMsg, setGradingMsg] = useState("");
  const [gradingError, setGradingError] = useState("");
  const [gradingResult, setGradingResult] = useState<any>(null);
  const [copiedId, setCopiedId] = useState("");
  
  // Historical feedback modal
  const [activeFeedbackItem, setActiveFeedbackItem] = useState<any>(null);
  const [feedbackTab, setFeedbackTab] = useState("brief");
  const [resultTab, setResultTab] = useState("brief");
  const [showCalendarModal, setShowCalendarModal] = useState(false);
  const [calendarUrlCopied, setCalendarUrlCopied] = useState(false);
  const [archiveModalData, setArchiveModalData] = useState<{level: number, url: string, date?: string}[] | null>(null);
  
  // Podcast State
  const [generatingPodcasts, setGeneratingPodcasts] = useState<Record<string, boolean>>({});

  // Push notification state
  const [pushPermission, setPushPermission] = useState<string>("default");
  const [pushSubscribed, setPushSubscribed] = useState(false);

  // Check notification permission on mount
  useEffect(() => {
    if (typeof window !== "undefined" && "Notification" in window) {
      setPushPermission(Notification.permission);
    }
  }, []);

  const subscribeToPush = useCallback(async () => {
    try {
      const permission = await Notification.requestPermission();
      setPushPermission(permission);
      if (permission !== "granted") return;

      const reg = await navigator.serviceWorker.ready;
      const vapidKey = process.env.NEXT_PUBLIC_VAPID_PUBLIC_KEY;
      if (!vapidKey) { console.error("No VAPID key"); return; }

      let sub = await reg.pushManager.getSubscription();
      if (!sub) {
        sub = await reg.pushManager.subscribe({
          userVisibleOnly: true,
          applicationServerKey: vapidKey,
        });
      }

      const subJson = sub.toJSON();
      await fetch("/api/push/subscribe", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ endpoint: subJson.endpoint, keys: subJson.keys }),
      });
      setPushSubscribed(true);
    } catch (err) {
      console.error("Push subscribe error:", err);
    }
  }, []);

  const togglePush = useCallback(async () => {
    if (pushSubscribed) {
      try {
        const reg = await navigator.serviceWorker.ready;
        const sub = await reg.pushManager.getSubscription();
        if (sub) {
          const endpoint = sub.endpoint;
          await sub.unsubscribe();
          await fetch("/api/push/subscribe", {
            method: "DELETE",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ endpoint }),
          });
        }
        setPushSubscribed(false);
      } catch (err) {
        console.error("Push unsubscribe error:", err);
      }
    } else {
      subscribeToPush();
    }
  }, [pushSubscribed, subscribeToPush]);

  const fetchReviews = useCallback(() => {
    fetch('/api/reviews')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          setUpcomingReviews(formatItems(data));
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    // Only fetch if we somehow don't have reviews (initial load missing)
    // or when returning to the dashboard tab from another tab
    if (activeTab === "dashboard" && upcomingReviews.length === 0) {
      fetchReviews();
    }
  }, [activeTab, fetchReviews]);

  const handleDeleteModule = async (e: React.MouseEvent, id: string) => {
    e.stopPropagation();
    if (confirm("Möchtest du dieses Modul wirklich löschen?")) {
      try {
        const res = await fetch(`/api/reviews/${id}`, { method: "DELETE" });
        if (res.ok) {
          fetchReviews();
        } else {
          alert("Fehler beim Löschen des Moduls.");
        }
      } catch (err) {
        console.error(err);
        alert("Fehler beim Löschen des Moduls.");
      }
    }
  };

  const copyToClipboard = (text: string, id: string) => {
    navigator.clipboard.writeText(text);
    setCopiedId(id);
    setTimeout(() => setCopiedId(""), 2000);
  };

  const handleGeneratePodcast = async (e: React.MouseEvent, reviewId: string, podcastType: "pre" | "post") => {
    e.stopPropagation();
    const stateKey = `${reviewId}-${podcastType}`;
    setGeneratingPodcasts(prev => ({ ...prev, [stateKey]: true }));
    try {
      const res = await fetch("/api/podcast/generate", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ itemId: reviewId, podcastType })
      });
      if (!res.ok) {
        const errData = await res.json();
        throw new Error(errData.error || "Failed to start generation");
      }
      alert(`Podcast generation started in the background! This takes about 3-5 minutes. You will receive a push notification when it's ready (refresh the page later).`);
    } catch (err: any) {
      alert(`Error: ${err.message}`);
      setGeneratingPodcasts(prev => ({ ...prev, [stateKey]: false }));
    }
  };

  const startQuiz = (review: any) => {
    setSelectedReview(review);
    
    // Extract quiz based on level
    const level = review.level;
    const quizFields = [
      review.raw.quiz1DocId,
      review.raw.quiz2DocId,
      review.raw.quiz3DocId,
      review.raw.quiz4DocId,
      review.raw.quiz5DocId,
      review.raw.quiz6DocId,
      review.raw.quiz7DocId
    ];
    // For levels 6 and beyond, we keep rolling over the quiz7DocId slot
    const quizText = (level >= 6 ? review.raw.quiz7DocId : quizFields[level]) || review.raw.quiz1DocId || "";
    
    // Only display/process student questions
    const studentQuizOnly = extractStudentQuiz(quizText);
    
    // Generate a template for answers based strictly on actual questions
    const taskMatches = studentQuizOnly.match(/Aufgabe \d+/g) || [];
    let answerTemplate = "";
    if (taskMatches.length > 0) {
      answerTemplate = taskMatches.map((task: string) => `${task}:\n\n`).join("\n");
    } else {
      answerTemplate = "Aufgabe 1:\n\nAufgabe 2:\n\n";
    }
    
    setStudentAnswers(answerTemplate);

    // Parse individual tasks for structured answer sheet
    const tasks = parseQuizTasks(studentQuizOnly);
    setParsedTasks(tasks);

    const initialAnswers: Record<string, string> = {};
    tasks.forEach(t => {
      initialAnswers[t.id] = "";
    });
    setIndividualAnswers(initialAnswers);

    setGradingResult(null);
    setGradingError("");
    setResultTab("brief");
    setActiveTab("quiz");
  };

  useEffect(() => {
    if (upcomingReviews.length > 0 && typeof window !== "undefined") {
      const params = new URLSearchParams(window.location.search);
      const quizId = params.get("quizId");
      if (quizId) {
        const review = upcomingReviews.find(r => r.id === quizId);
        if (review) {
          window.history.replaceState({}, document.title, window.location.pathname);
          startQuiz(review);
        }
      }
    }
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [upcomingReviews]);

  const exportQuizForPrint = () => {
    if (!selectedReview || parsedTasks.length === 0) return;
    window.print();
  };

  const handleGenerate = async () => {
    if ((!textInput && uploadedFiles.length === 0) || !subjectInput) return;
    setIsGenerating(true);
    setProgressStep(0);
    setProgressMsg("Starting ironclad engine...");

    try {
      const formData = new FormData();
      formData.append("subjectMain", subjectInput);
      formData.append("subjectSub", topicInput || "Module");
      formData.append("language", language);
      if (textInput) formData.append("content", textInput);
      uploadedFiles.forEach(file => formData.append("files", file));

      const res = await fetch("/api/quiz", {
        method: "POST",
        body: formData
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const lines = decoder.decode(value, { stream: true }).split("\n");
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                if (data.event === "progress") {
                  setProgressStep(data.data.step);
                  setProgressMsg(data.data.message);
                } else if (data.event === "done") {
                  setProgressStep(8);
                  setProgressMsg("Successfully integrated into your SRS database!");
                  setTimeout(() => {
                    setIsGenerating(false);
                    setActiveTab("dashboard");
                    setSubjectInput("");
                    setTextInput("");
                    setUploadedFiles([]);
                  }, 3000);
                } else if (data.event === "error") {
                  setProgressMsg(data.data.message);
                  alert(`Generierungsfehler: ${data.data.message}`);
                  setIsGenerating(false);
                }
              } catch (e) {
                // Ignore incomplete json chunks
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setProgressMsg(e.message || "Failed to connect to server.");
      setIsGenerating(false);
    }
  };

  const handleGrade = async () => {
    if (!selectedReview) return;

    let payloadAnswers = studentAnswers;
    if (parsedTasks.length > 0) {
      payloadAnswers = parsedTasks.map(task => {
        const answer = individualAnswers[task.id] || "";
        return `${task.header}\n${answer.trim()}`;
      }).join("\n\n");
    }

    if (!payloadAnswers.trim()) return;

    setIsGrading(true);
    setGradingStep(0);
    setGradingMsg("Calling grading agents...");
    setGradingError("");

    try {
      const res = await fetch("/api/grade", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          itemId: selectedReview.id,
          studentAnswers: payloadAnswers,
          language: language
        })
      });

      if (!res.ok) {
        const errorData = await res.json().catch(() => ({}));
        throw new Error(errorData.error || `Server returned status ${res.status}`);
      }

      if (!res.body) throw new Error("No response body");

      const reader = res.body.getReader();
      const decoder = new TextDecoder();
      let done = false;

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          const lines = decoder.decode(value, { stream: true }).split("\n");
          for (const line of lines) {
            if (line.trim()) {
              try {
                const data = JSON.parse(line);
                if (data.event === "progress") {
                  setGradingStep(data.data.step);
                  setGradingMsg(data.data.message);
                } else if (data.event === "done") {
                  setGradingStep(5);
                  setGradingMsg("Grading finished! Scheduling updated.");
                  setGradingResult(data.data);
                  setIsGrading(false);
                } else if (data.event === "error") {
                  setGradingMsg(data.data.message);
                  setGradingError(data.data.message);
                  alert(`Grading Error: ${data.data.message}`);
                  setIsGrading(false);
                }
              } catch (e) {
                // Ignore chunk parse errors
              }
            }
          }
        }
      }
    } catch (e: any) {
      console.error(e);
      setGradingMsg(e.message || "Failed to connect to grading server.");
      setGradingError(e.message || "Failed to connect to grading server.");
      setIsGrading(false);
    }
  };

  return (
    <div className="min-h-screen bg-transparent flex font-sans selection:bg-white/[0.12]">
      
      {/* Print-Only Wrapper */}
      {activeTab === "quiz" && selectedReview && parsedTasks.length > 0 && (
        <div className="hidden print:block p-4 md:p-8 w-full bg-white text-black">
          <div className="max-w-3xl mx-auto">
            <div className="border-b-2 border-zinc-200 pb-6 mb-8">
              <h1 className="text-2xl font-bold font-sans text-zinc-900 mb-2">{selectedReview.topic}</h1>
              <p className="text-xs text-zinc-500 font-medium">
                <span className="bg-zinc-900 text-zinc-300 px-2 py-0 rounded mr-2 font-bold uppercase tracking-wider">Level {selectedReview.level + 1}</span>
                {selectedReview.subject}
              </p>
              <div className="flex justify-between mt-4 pt-4 border-t border-zinc-200 text-xs text-zinc-500">
                <p>Name: ___________________________</p>
                <p>Datum: _______________</p>
              </div>
            </div>

            <div className="space-y-8">
              {parsedTasks.map(task => {
                let lineCount = 4;
                const isMC = /^[A-D]\)\s/m.test(task.questionText);
                if (isMC) {
                  lineCount = 2;
                } else {
                  const match = task.questionText.match(/(\d+)(?:[-–](\d+))?\s*(Sätze|Stichpunkt)/i);
                  if (match) {
                    const num = parseInt(match[2] || match[1], 10);
                    if (!isNaN(num)) {
                      lineCount = Math.max(3, Math.min(15, Math.ceil(num * 1.5)));
                    }
                  }
                }
                
                return (
                  <div key={task.id} className="break-inside-avoid" style={{ pageBreakInside: 'avoid' }}>
                    <h2 className="text-sm font-bold text-white uppercase tracking-wider mb-2">{task.label}</h2>
                    <div className="text-sm text-zinc-800 bg-zinc-50 border border-zinc-200 rounded-lg p-4 mb-4 whitespace-pre-wrap leading-relaxed">
                      {task.questionText}
                    </div>
                    <div>
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-2">Antwort:</p>
                      {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="border-b border-zinc-300 h-8 w-full"></div>
                      ))}
                    </div>
                  </div>
                );
              })}
            </div>
          </div>
        </div>
      )}

      {/* Main App (Hidden in Print) */}
      <div className="flex flex-col md:flex-row w-full print:hidden">

      {/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/[0.06] bg-zinc-950 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg shadow-black">
            <CpuChipIcon className="text-white w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">SRS<span className="text-gradient">Master</span></h1>
        </div>
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 text-zinc-400 hover:text-white">
          {showMobileMenu ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={`${showMobileMenu ? 'flex' : 'hidden'} md:flex w-full md:w-64 sidebar-gradient border-r border-white/[0.06] flex-col p-6 sticky md:top-0 h-[calc(100vh-73px)] md:h-screen z-40 overflow-y-auto`}
      >
        <div className="hidden md:flex items-center gap-4 mb-6 md:mb-12">
          <div className="w-12 h-12 rounded-xl bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg shadow-black">
            <CpuChipIcon className="text-white w-6 h-6" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">SRS<span className="text-gradient">Master</span></h1>
            <div className="mt-2 text-[10px] font-bold text-zinc-400 bg-zinc-900 px-2 py-0 rounded-full border border-zinc-800 self-start">
              Semester {currentSemester}
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <CalendarDaysIcon className="w-6 h-6 shrink-0" />
            <span className="font-medium whitespace-nowrap">Dashboard</span>
          </button>
          <button onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }} className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 ${activeTab === 'upload' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <CloudArrowUpIcon className="w-6 h-6 shrink-0" />
            <span className="font-medium whitespace-nowrap">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</span>
          </button>
          <button onClick={() => { setActiveTab("library"); setShowMobileMenu(false); }} className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 ${activeTab === 'library' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <BookOpenIcon className="w-6 h-6 shrink-0" />
            <span className="font-medium whitespace-nowrap">{language === 'german' ? 'Bibliothek' : 'Library'}</span>
          </button>
          <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 nav-item-idle`}>
            <Cog8ToothIcon className="w-6 h-6 shrink-0" />
            <span className="font-medium whitespace-nowrap">{language === 'german' ? 'Einstellungen' : 'Settings'}</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-4">
          {/* Push Notification Toggle */}
          <button
            onClick={togglePush}
            className={`flex items-center gap-4 px-4 py-4 rounded-xl transition-all duration-200 ${
              pushPermission === "granted" && pushSubscribed
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "nav-item-idle"
            }`}
          >
            {pushPermission === "granted" && pushSubscribed ? (
              <BellIcon className="w-6 h-6 shrink-0" />
            ) : (
              <BellSlashIcon className="w-6 h-6 shrink-0" />
            )}
            <span className="font-medium text-sm whitespace-nowrap">
              {pushPermission === "granted" && pushSubscribed
                ? language === "german" ? "Mitteilungen an" : "Notifications On"
                : pushPermission === "denied"
                ? language === "german" ? "Blockiert" : "Notifications Blocked"
                : language === "german" ? "Mitteilungen erlauben" : "Enable Notifications"}
            </span>
          </button>

          <div className="card-surface p-4 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-24 h-24 hidden"></div>
            <SparklesIcon className="w-6 h-6 text-zinc-400 mb-2" />
            <h3 className="font-medium text-white/90 text-sm mb-2">Live Tutor Pro</h3>
            <p className="text-xs text-white/40 mb-4">{language === "german" ? "Optimiere dein Lernen mit Sprach-KI." : "Upgrade your learning with voice AI."}</p>
            <button className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-xs font-medium border border-white/[0.08] text-white/30 cursor-not-allowed transition-colors">
              {language === "german" ? "Freischalten (Phase 2)" : "Unlock (Phase 2)"}
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className={`${showMobileMenu ? "hidden" : "block"} md:block flex-1 p-4 md:p-12 overflow-y-auto relative h-[calc(100vh-73px)] md:h-screen`}>
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div 
              key="dash"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto"
            >
              <header className="mb-6 md:mb-12 flex justify-between items-end">
                <div>
                  <h2 className="text-xs sm:text-sm font-medium text-white mb-2 uppercase tracking-wider">{language === 'german' ? 'Willkommen zurück' : 'Welcome back'}</h2>
                  <h1 className="text-2xl sm:text-4xl font-bold tracking-tight text-white mb-2">{language === 'german' ? 'Bereit für das nächste Level?' : 'Ready to level up?'}</h1>
                  <p className="text-white/50">{language === 'german' ? `Du hast ${upcomingReviews.filter(r => r.isDue).length} Wiederholungen heute.` : `You have ${upcomingReviews.filter(r => r.isDue).length} reviews due today.`}</p>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-4 md:gap-8">
                {/* Reviews List */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-4 gap-3">
                    <h3 className="text-lg sm:text-xl font-semibold flex items-center gap-2">
                      <ClockIcon className="w-5 h-5 sm:w-6 sm:h-6 text-white" />
                      {language === 'german' ? 'Anstehende Wiederholungen' : 'Upcoming Reviews'}
                    </h3>
                    <button
                      onClick={() => setShowCalendarModal(true)}
                      className="flex items-center justify-center gap-2 px-4 py-2 text-xs font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-white hover:text-zinc-300 transition-all w-full sm:w-auto"
                    >
                      <CalendarDaysIcon className="w-4 h-4" />
                      {language === 'german' ? 'Kalender synchronisieren' : 'Sync to Calendar'}
                    </button>
                  </div>

                  {(() => {
                    const dueItems = upcomingReviews.filter(r => r.isDue);
                    const scheduledItems = upcomingReviews.filter(r => !r.isDue);
                    const itemsToRender = [
                      ...dueItems,
                      ...(showAllScheduled ? scheduledItems : scheduledItems.slice(0, 12))
                    ];

                    if (itemsToRender.length === 0) {
                      return (
                        <div className="card-surface p-4 md:p-12 text-center text-white/40">
                          {language === 'german' ? 'Keine Wiederholungen gefunden. Lade Vorlesungsmaterial hoch, um dein erstes Quiz zu erstellen!' : 'No reviews found. Upload lecture material to generate your first quiz!'}
                        </div>
                      );
                    }

                    return (
                      <>
                        {itemsToRender.map((review, i) => (
                          <motion.div 
                            key={review.id} 
                            onClick={() => startQuiz(review)}
                            className={`card-surface-elevated p-6 transition-all duration-300 group cursor-pointer relative overflow-hidden ${review.isDue ? 'border-emerald-500/30 hover:border-emerald-400/50 shadow-[0_0_20px_-5px_rgba(16,185,129,0.15)]' : 'hover:border-white/[0.2]'}`}
                          >
                        <div className="accent-bar"></div>
                        <div className="flex justify-between items-start pl-2">
                          <div className="flex-1 min-w-0 pr-4">
                            <div className="flex flex-wrap items-center gap-2 mb-2">
                              <span className={`text-[10px] sm:text-xs font-semibold px-2 py-1.5 sm:py-2 rounded-md ${review.isDue ? 'badge-due' : 'badge-level'}`}>Level {review.level + 1}</span>
                              <span className="text-[10px] font-bold text-white/50 bg-white/[0.04] px-2 py-0 rounded-full border border-white/[0.08]">
                                Sem {review.semester}
                              </span>
                              <div className="text-right">
                                {review.isDue ? (
                                  <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-emerald-500/10 text-emerald-400 border border-emerald-500/20 text-xs font-bold uppercase tracking-wider">
                                    <span className="w-1.5 h-1.5 rounded-full bg-emerald-400 mr-2 animate-pulse"></span>
                                    {language === 'german' ? 'JETZT FÄLLIG' : 'DUE NOW'}
                                  </span>
                                ) : (
                                  <span className="text-xs text-white/40">{language === 'german' ? `Geplant: ${review.dueDate}` : `Scheduled: ${review.dueDate}`}</span>
                                )}
                              </div>
                            </div>
                            <h4 className="text-lg font-medium text-white truncate">{review.subject}</h4>
                            <p className="text-sm text-white/40 truncate">{review.topic}</p>

                            {review.raw.lastFeedback && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveFeedbackItem(review.raw);
                                  setFeedbackTab("brief");
                                }}
                                className="mt-4 text-xs bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] text-white/50 px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                              >
                                <DocumentTextIcon className="w-4 h-4 text-white" />
                                {language === "german" ? "Feedback ansehen" : "View Remediation Brief"}
                              </button>
                            )}

                            {(() => {
                              let latestVideoUrl = review.raw.videoUrl;
                              let videoHistory: any[] = [];
                              let latestVideoLevel = 0;
                              if (latestVideoUrl && latestVideoUrl.startsWith("[")) {
                                try {
                                  videoHistory = JSON.parse(latestVideoUrl);
                                  if (videoHistory.length > 0) {
                                    const lastVid = videoHistory[videoHistory.length - 1];
                                    latestVideoUrl = lastVid.url;
                                    latestVideoLevel = lastVid.level !== undefined ? lastVid.level : 0;
                                  } else {
                                    latestVideoUrl = null;
                                  }
                                } catch(e) { }
                              } else if (latestVideoUrl && latestVideoUrl.startsWith("http")) {
                                videoHistory = [{ level: 0, url: latestVideoUrl }];
                                latestVideoLevel = 0;
                              }

                              const isWaitingForNewVideo = latestVideoLevel < review.level;
                              const archiveVideos = isWaitingForNewVideo ? videoHistory : videoHistory.slice(0, -1);

                              return (
                                <>
                                  {archiveVideos.length > 0 && (
                                    <button 
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setArchiveModalData(archiveVideos);
                                      }}
                                      className="mt-2 text-xs bg-indigo-500/10 hover:bg-indigo-500/20 border border-indigo-500/20 text-indigo-400 px-4 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                                    >
                                      <ClockIcon className="w-4 h-4" />
                                      View Video Archive ({archiveVideos.length})
                                    </button>
                                  )}

                                  <div className="mt-6">
                                    <div className="text-[10px] font-bold text-white/30 uppercase mb-2 pl-1 tracking-widest flex items-center gap-2">
                                      {language === 'german' ? 'Lernmaterialien' : 'Study Materials'}
                                    </div>
                                    <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 p-3 sm:p-4 bg-black/40 rounded-xl border border-white/5 relative overflow-hidden">
                              {/* PRE-PODCAST */}
                              <div className="flex-1 min-w-0">
                                <h5 className="text-[10px] font-bold text-stone-500 uppercase mb-2 truncate">{language === "german" ? "Vorbereitung" : "Pre-Lecture"}</h5>
                                {review.raw.prePodcastUrl && review.raw.prePodcastUrl.startsWith("http") ? (
                                  <a 
                                    href={review.raw.prePodcastUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()} 
                                    className="text-xs bg-zinc-100 hover:bg-white border border-zinc-200 text-black px-2 py-2 rounded-md flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                  >
                                    <SparklesIcon className="w-4 h-4 shrink-0" />
                                    Audio 1
                                  </a>
                                ) : (
                                  <div className="text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-2 rounded-md flex items-center gap-2 w-full justify-center text-center">
                                    {language === 'german' ? 'Wird generiert' : 'Generating'}
                                  </div>
                                )}
                              </div>

                              {/* POST-PODCAST */}
                              <div className="flex-1 min-w-0">
                                <h5 className="text-[10px] font-bold text-stone-500 uppercase mb-2 truncate">{language === "german" ? "Nachbereitung" : "Post-Lecture"}</h5>
                                {review.raw.postPodcastUrl && review.raw.postPodcastUrl.startsWith("http") ? (
                                  <a 
                                    href={review.raw.postPodcastUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()} 
                                    className="text-xs bg-zinc-100 hover:bg-white border border-zinc-200 text-black px-2 py-2 rounded-md flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                  >
                                    <SparklesIcon className="w-4 h-4 shrink-0" />
                                    Audio 2
                                  </a>
                                ) : (
                                  <div className="text-[10px] font-medium bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-2 rounded-md flex items-center gap-2 w-full justify-center text-center">
                                    {language === 'german' ? 'Wird generiert' : 'Generating'}
                                  </div>
                                )}
                              </div>
                              
                              {/* VIDEO STUDIO */}
                              <div className="flex-1 min-w-0">
                                <h5 className="text-[10px] font-bold text-stone-500 uppercase mb-2 truncate">{language === "german" ? "Videostudio" : "Video Studio"}</h5>
                                {!isWaitingForNewVideo && latestVideoUrl && latestVideoUrl.startsWith("http") ? (
                                  <a 
                                    href={latestVideoUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer"
                                    onClick={(e) => e.stopPropagation()} 
                                    className="text-xs bg-emerald-100 hover:bg-emerald-50 border border-emerald-200 text-emerald-900 px-2 py-2 rounded-md flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                  >
                                    <SparklesIcon className="w-4 h-4 shrink-0" />
                                    Video
                                  </a>
                                ) : (
                                  <div className="text-[10px] bg-zinc-900 border border-zinc-800 text-zinc-500 px-2 py-2 rounded-md flex items-center gap-2 w-full justify-center text-center">
                                    {language === 'german' ? 'Wird generiert...' : 'Generating...'}
                                  </div>
                                )}
                              </div>
                              </div>
                                  </div>
                                </>
                              );
                            })()}


                          </div>
                          <div className="flex flex-col items-center gap-2 shrink-0">
                            <button className="hidden sm:flex w-12 h-12 rounded-full items-center justify-center transition-all bg-white/[0.04] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white group-hover:scale-110 cursor-pointer">
                              <ChevronRightIcon className="w-6 h-6 ml-2" />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteModule(e, review.id)}
                              className="w-10 h-10 sm:w-12 sm:h-12 rounded-full flex items-center justify-center transition-all bg-white/[0.04] text-white/40 hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
                              title="Delete Module"
                            >
                              <TrashIcon className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                        ))}
                        
                        {!showAllScheduled && scheduledItems.length > 12 && (
                          <button
                            onClick={() => setShowAllScheduled(true)}
                            className="w-full mt-4 py-4 rounded-xl card-surface-elevated flex items-center justify-center gap-2 text-white/50 hover:text-white transition-all cursor-pointer font-medium"
                          >
                            <ChevronDownIcon className="w-5 h-5" />
                            {language === 'german' ? `Alle ${scheduledItems.length} anstehenden anzeigen` : `Show all ${scheduledItems.length} upcoming`}
                          </button>
                        )}
                      </>
                    );
                  })()}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col gap-6">
                  <motion.div className="card-surface-elevated p-6 gradient-border cursor-pointer transition-colors" onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }}>
                    <h3 className="text-lg font-semibold mb-2 text-white">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</h3>
                    <p className="text-sm text-white/40 mb-4">{language === 'german' ? 'Füttere die KI mit einem neuen Modul, um den generativen 6-Stufen-Prozess zu starten.' : 'Feed the engine a new module to start the 6-stage generative AI pipeline.'}</p>
                    <button className="btn-primary w-full py-4 px-4 flex items-center justify-center gap-2 cursor-pointer">
                      <CloudArrowUpIcon className="w-6 h-6" />
                      {language === 'german' ? 'Jetzt hochladen' : 'Upload Now'}
                    </button>
                  </motion.div>
                </div>
              </div>
            </motion.div>
          )}

          {activeTab === "upload" && (
            <motion.div 
              key="upload"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-3xl mx-auto"
            >
              <header className="mb-8">
                <h1 className="text-3xl font-bold tracking-tight text-white mb-2">Ironclad Generator</h1>
                <p className="text-white/50">{language === 'german' ? 'Füge dein Vorlesungsmaterial hier ein, um den kompletten didaktischen KI-Prozess zu starten.' : 'Paste your lecture material below to run the full 6-stage Didactic AI chain.'}</p>
              </header>

              {isGenerating ? (
                <div className="card-surface-elevated p-4 md:p-12 flex flex-col items-center justify-center text-center">
                  <ArrowPathIcon className="w-12 h-12 text-white animate-spin mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-2">Processing Module...</h3>
                  <p className="text-white/50 mb-8 text-lg">{progressMsg}</p>
                  
                  <div className="progress-track w-full max-w-md h-4">
                    <motion.div 
                      className="progress-fill h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(progressStep / 8) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="w-full max-w-md mt-4 text-left space-y-3">
                     {[1, 2, 7, 8, 9, 10, 11].map(step => (
                        <div key={step} className={`flex items-center gap-4 text-sm ${progressStep > step ? 'text-emerald-400' : progressStep === step ? 'text-white font-medium' : 'text-white/20'}`}>
                           {progressStep > step ? <CheckCircleIcon className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                           {step === 1 ? "Blueprint Engine" : 
                            step === 2 ? "Quiz Agent (Level 1)" : 
                            step === 7 ? "Tutor Prompt Engine" :
                            step === 8 ? "Podcast Prompts" :
                            step === 9 ? "NotebookLM Audio" :
                            step === 10 ? "Google Drive Upload" :
                            "Saving Database Records"}
                        </div>
                     ))}
                  </div>
                </div>
              ) : (
                <div className="card-surface-elevated p-4 md:p-8 flex flex-col gap-6">
                  <div className="flex gap-4">
                    <div className="flex-1 flex flex-col justify-end">
                      <div className="flex items-start justify-between mb-2 gap-2">
                        <label className="text-sm font-medium text-white/50 leading-tight">{language === "german" ? `Modul (Semester ${currentSemester})` : `Module (Semester ${currentSemester})`}</label>
                        <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className="text-xs text-zinc-400 hover:text-white transition-colors shrink-0">{language === "german" ? "Verwalten" : "Manage Presets"}</button>
                      </div>
                      {modulePresets.length > 0 ? (
                        <select 
                          value={subjectInput}
                          onChange={e => setSubjectInput(e.target.value)}
                          className="input-dark w-full px-4 py-4 appearance-none bg-zinc-900"
                        >
                          {modulePresets.map(preset => (
                            <option key={preset} value={preset}>{preset}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="input-dark w-full px-4 py-4 text-white/50 text-sm flex items-center justify-between">
                          {language === "german" ? `Keine Module für Semester ${currentSemester} definiert` : `No modules defined for Semester ${currentSemester}`}
                          <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className="text-zinc-400 hover:text-white font-medium">{language === "german" ? "Hinzufügen" : "Add Presets"}</button>
                        </div>
                      )}
                    </div>
                    <div className="flex-1 flex flex-col justify-end">
                      <label className="block text-sm font-medium text-white/50 mb-2">{language === "german" ? "Thema" : "Topic"}</label>
                      <input 
                        type="text" 
                        value={topicInput}
                        onChange={e => setTopicInput(e.target.value)}
                        placeholder="e.g. Memory & Motivation"
                        className="input-dark w-full px-4 py-4"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/50 mb-2">{language === "german" ? "Vorlesungsmaterial (Dateien oder Text)" : "Lecture Material (Files or Text)"}</label>
                    <div 
                      className={`w-full border-2 border-dashed rounded-xl p-4 md:p-8 mb-4 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-zinc-9000 bg-white/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}
                      onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
                      onDragLeave={() => setIsDragging(false)}
                      onDrop={(e) => {
                        e.preventDefault();
                        setIsDragging(false);
                        if (e.dataTransfer.files && e.dataTransfer.files.length > 0) {
                          setUploadedFiles(prev => [...prev, ...Array.from(e.dataTransfer.files)]);
                        }
                      }}
                    >
                      <CloudArrowUpIcon className="w-8 h-8 text-white/30 mb-4" />
                      <p className="text-white/40 text-sm text-center mb-4">
                        {language === "german" ? "Ziehe deine PDFs, Excel- oder Word-Dateien hierher" : "Drag and drop your PDFs, Excel, or Word files here"}
                      </p>
                      <input 
                        type="file" 
                        multiple 
                        accept=".pdf,.xlsx,.csv,.docx,.txt"
                        className="hidden" 
                        id="file-upload"
                        onChange={(e) => {
                          if (e.target.files && e.target.files.length > 0) {
                            setUploadedFiles(prev => [...prev, ...Array.from(e.target.files!)]);
                          }
                        }}
                      />
                      <label htmlFor="file-upload" className="px-4 py-2 bg-white/[0.06] hover:bg-white/[0.1] rounded-lg text-sm text-white/60 cursor-pointer border border-white/[0.1] transition-colors">
                        {language === "german" ? "Dateien durchsuchen" : "Browse Files"}
                      </label>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {uploadedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white/[0.08] text-zinc-300 px-4 py-2 rounded-lg text-xs font-medium border border-white/[0.12]">
                            <DocumentTextIcon className="w-4 h-4" />
                            {file.name}
                            <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))} className="ml-2 hover:text-white cursor-pointer">
                              <XMarkIcon className="w-4 h-4" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea 
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      placeholder={language === "german" ? "...oder füge deine Vorlesungsskripte, Transkripte oder rohen Text hier ein..." : "...or paste your lecture notes, transcript, or raw text here..."}
                      className="input-dark w-full px-4 py-4 h-32 resize-none"
                    />
                  </div>
                  <button 
                    onClick={handleGenerate}
                    disabled={(!textInput && uploadedFiles.length === 0) || !subjectInput}
                    className="btn-primary w-full py-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    <CpuChipIcon className="w-6 h-6" />
                    {language === "german" ? "6-Stufen KI-Generierung starten" : "Start 6-Stage AI Generation"}
                  </button>
                </div>
              )}
            </motion.div>
          )}

          {activeTab === "library" && (
            <motion.div 
              key="library"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto"
            >
              <header className="mb-6 md:mb-12">
                <h1 className="text-4xl font-bold tracking-tight text-white mb-2">{language === "german" ? "Meine Bibliothek" : "My Library"}</h1>
                <p className="text-white/50">{language === "german" ? "Überprüfe deine gespeicherten Module, Tutor-Prompts und Lernpläne." : "Review your stored modules, tutor prompts, and generating schedules."}</p>
              </header>
              <div className="card-surface p-4 md:p-12 text-center text-white/40">
                {language === "german" ? "Alle generierten Kurse und Details werden hier angezeigt." : "All generated courses and details will reflect here as we build custom features!"}
              </div>
            </motion.div>
          )}

          {activeTab === "quiz" && selectedReview && (
            <motion.div 
              key="quiz"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-4xl mx-auto"
            >
              <button 
                onClick={() => {
                  setActiveTab("dashboard");
                  setSelectedReview(null);
                  setGradingResult(null);
                }} 
                className="flex items-center gap-2 text-sm text-white/40 hover:text-white mb-6 transition-colors cursor-pointer"
              >
                <ArrowLeftIcon className="w-4 h-4" />
                {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
              </button>

              <header className="mb-8">
                <div className="flex items-center gap-4 mb-2">
                  <span className="text-xs font-semibold px-2 py-2 rounded-md badge-level">Level {selectedReview.level + 1}</span>
                  <span className="text-xs text-white/40">{language === "german" ? "Aktives Quiz" : "Active Quiz"}</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">{selectedReview.subject}</h1>
                    <p className="text-xs text-white/40 mt-2 font-medium">{selectedReview.topic}</p>
                  </div>
                  {parsedTasks.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={exportQuizForPrint}
                      className="flex items-center gap-2 px-4 py-2 btn-secondary text-xs font-bold rounded-xl cursor-pointer"
                    >
                      <PrinterIcon className="w-4 h-4" />
                      Exportieren
                    </motion.button>
                  )}
                </div>
              </header>

              {gradingError && !isGrading && (
                <div className="mb-6 p-6 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-red-400 font-semibold">
                    <ExclamationTriangleIcon className="w-6 h-6" />
                    <span>Grading Failed</span>
                  </div>
                  <pre className="text-xs font-mono bg-white/[0.03] p-4 rounded-xl border border-white/[0.06] whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto leading-relaxed text-left text-red-300/70">
                    {gradingError}
                  </pre>
                  <p className="text-xs text-white/30 text-left">
                    Please check your database, Gemini API key, or server logs, and click below to try submitting again.
                  </p>
                </div>
              )}

              {isGrading ? (
                <div className="card-surface-elevated p-4 md:p-12 flex flex-col items-center justify-center text-center">
                  <ArrowPathIcon className="w-12 h-12 text-white animate-spin mb-6" />
                  <h3 className="text-2xl font-bold mb-2 text-white">Grading Submission...</h3>
                  <p className="text-white/50 mb-8 text-lg">{gradingMsg}</p>
                  
                  <div className="progress-track w-full max-w-md h-4">
                    <motion.div 
                      className="progress-fill h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (gradingStep / 4) * 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="w-full max-w-md mt-4 text-left space-y-3">
                     {[1,2,3,4].map(step => (
                        <div key={step} className={`flex items-center gap-4 text-sm ${gradingStep > step ? 'text-emerald-400' : gradingStep === step ? 'text-white font-medium' : 'text-white/20'}`}>
                           {gradingStep > step ? <CheckCircleIcon className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                           {step === 1 ? "Co-Prüfer 1 & 2 (Parallel Evaluation)" : 
                            step === 2 ? "Chef-Prüfer (Consolidation & Brief)" : 
                            step === 3 ? "Follow-Up Generation (Quiz & Video)" : "Saving Database Records"}
                        </div>
                     ))}
                  </div>
                </div>
              ) : gradingResult ? (
                <div className="space-y-6">
                  <div className={`card-surface-elevated p-4 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${gradingResult.isPass ? 'border-emerald-500/20 glow-success' : 'border-red-500/20 glow-danger'}`}>
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-wider px-4 py-2 rounded-full ${gradingResult.isPass ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                        {gradingResult.isPass ? "PASS (Bestanden)" : "REPEAT (Wiederholen)"}
                      </span>
                      <h2 className="text-3xl font-extrabold text-white mt-4">
                        {gradingResult.isPass ? "Level Promoted!" : "Remediation Scheduled"}
                      </h2>
                      <p className="text-white/50 mt-2 text-sm">
                        Next review set to: <strong className="text-white">{new Date(gradingResult.srsItem.nextReviewDate).toLocaleDateString()}</strong> (Level {gradingResult.srsItem.currentLevel + 1})
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setActiveTab("dashboard");
                        setSelectedReview(null);
                        setGradingResult(null);
                      }}
                      className="btn-secondary px-6 py-4 font-semibold rounded-xl cursor-pointer"
                    >
                      {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
                    </button>
                  </div>

                  <div className="card-surface-elevated overflow-hidden">
                    <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                      <h3 className="text-sm font-medium text-white">Remediation Brief</h3>
                    </div>

                    <div className="p-4 md:p-8">
                      <div className="whitespace-pre-wrap font-sans text-white/60 text-base leading-relaxed">
                        {gradingResult.srsItem.lastFeedback}
                      </div>
                    </div>
                  </div>
                </div>
              ) : (
                /* Quiz taking UI */
                <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <AcademicCapIcon className="w-6 h-6 text-white" />
                      {language === "german" ? "Quiz-Aufgabe" : "Quiz Assignment"}
                    </h3>
                  </div>

                  {parsedTasks.length > 0 ? (
                    <div className="space-y-6">
                      {parsedTasks.map((task, idx) => {
                        const isMC = /^[A-D]\)\s/m.test(task.questionText);
                        return (
                          <motion.div 
                            key={task.id} 
                            initial={{ opacity: 0, y: 15 }}
                            animate={{ opacity: 1, y: 0 }}
                            transition={{ delay: idx * 0.05 }}
                            className="card-surface-elevated p-4 md:p-8 rounded-3xl"
                          >
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-4">{task.label}</h3>
                            <div className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed mb-6 font-medium">
                              {task.questionText}
                            </div>
                            
                            <div className="border-t border-white/[0.06] pt-6">
                              <span className="block text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Your Answer:</span>
                              <textarea
                                value={individualAnswers[task.id] || ""}
                                onChange={e => {
                                  setIndividualAnswers(prev => ({
                                    ...prev,
                                    [task.id]: e.target.value
                                  }));
                                }}
                                placeholder={language === "german" ? (isMC ? "Tippe A, B, C oder D..." : "Tippe deine Antwort hier ein...") : (isMC ? "Type A, B, C, or D..." : "Type your answer here...")}
                                rows={isMC ? 2 : 4}
                                className="input-dark w-full px-6 py-4 text-sm resize-none"
                              />
                            </div>
                          </motion.div>
                        );
                      })}
                      
                      <div className="pt-6">
                        <motion.button 
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleGrade}
                          disabled={!parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0)}
                          className="btn-primary w-full py-6 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                        >
                          <SparklesIcon className="w-6 h-6" />
                          {language === "german" ? "ALLE ANTWORTEN ZUR KI-BEWERTUNG EINREICHEN" : "Submit All Answers for AI Grading"}
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="card-surface-elevated p-4 md:p-8 rounded-3xl flex flex-col">
                      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 font-sans whitespace-pre-wrap text-white/50 text-sm leading-relaxed mb-6">
                        {(() => {
                          const level = selectedReview.level;
                          const quizFields = [
                            selectedReview.raw.quiz1DocId,
                            selectedReview.raw.quiz2DocId,
                            selectedReview.raw.quiz3DocId,
                            selectedReview.raw.quiz4DocId,
                            selectedReview.raw.quiz5DocId,
                            selectedReview.raw.quiz6DocId,
                            selectedReview.raw.quiz7DocId
                          ];
                          const rawQuiz = (level >= 6 ? selectedReview.raw.quiz7DocId : quizFields[level]) || selectedReview.raw.quiz1DocId || "";
                          return extractStudentQuiz(rawQuiz);
                        })()}
                      </div>
                      
                      <span className="block text-xs font-bold text-white/30 uppercase tracking-wider mb-4">Your Answer:</span>
                      <textarea 
                        value={studentAnswers}
                        onChange={e => setStudentAnswers(e.target.value)}
                        placeholder="Write your answers here..."
                        className="input-dark flex-1 w-full p-6 text-sm resize-none min-h-[300px] mb-6"
                      />
                      <motion.button 
                        whileHover={{ scale: 1.01 }}
                        whileTap={{ scale: 0.98 }}
                        onClick={handleGrade}
                        disabled={!studentAnswers.trim()}
                        className="btn-primary w-full py-6 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                      >
                        <SparklesIcon className="w-6 h-6" />
                        Submit Answer for AI Grading
                      </motion.button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
          )}
        </AnimatePresence>
        {/* Archive Modal */}
        <AnimatePresence>
          {archiveModalData && (
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
              <motion.div 
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="card-glass w-full max-w-lg rounded-3xl overflow-hidden shadow-2xl shadow-black/50 flex flex-col max-h-[85vh] border border-white/[0.1]"
              >
                <div className="p-6 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02]">
                  <h3 className="text-xl font-bold text-white">Video Archive</h3>
                  <button 
                    onClick={() => setArchiveModalData(null)}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>
                <div className="p-6 space-y-4 overflow-y-auto">
                  {archiveModalData.map((item, idx) => (
                    <div key={idx} className="card-surface p-4 rounded-xl flex items-center justify-between">
                      <div>
                        <h4 className="text-white font-medium">Level {item.level + 1} Video</h4>
                        {item.date && <p className="text-xs text-white/40">{new Date(item.date).toLocaleDateString()}</p>}
                      </div>
                      <a 
                        href={item.url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                      >
                        <SparklesIcon className="w-4 h-4" />
                        Watch
                      </a>
                    </div>
                  ))}
                </div>
              </motion.div>
            </div>
          )}
        </AnimatePresence>

      </main>

      {/* Historical Feedback Modal */}
      <AnimatePresence>
        {activeFeedbackItem && (
          <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/70 backdrop-blur-sm">
            <motion.div 
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-glass w-full max-w-4xl rounded-3xl overflow-hidden shadow-2xl shadow-black/50 flex flex-col max-h-[85vh] border border-white/[0.1]"
            >
              {/* Header */}
              <div className="p-6 border-b border-white/[0.06] flex justify-between items-center bg-white/[0.02]">
                <div>
                  <h3 className="text-xl font-bold text-white">{activeFeedbackItem.subjectSub}</h3>
                  <p className="text-xs text-white/40">{activeFeedbackItem.subjectMain} — Level {activeFeedbackItem.currentLevel + 1}</p>
                </div>
                <button 
                  onClick={() => setActiveFeedbackItem(null)}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <XMarkIcon className="w-4 h-4" />
                </button>
              </div>

              {/* Header/Title */}
              <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4">
                <h3 className="text-sm font-medium text-white">{language === "german" ? "Feedback & Auswertung" : "Remediation Brief & Feedback"}</h3>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                <div className="whitespace-pre-wrap font-sans text-white/55 text-sm leading-relaxed">
                  {activeFeedbackItem.lastFeedback}
                </div>
              </div>
            </motion.div>
          </div>
        )}
      </AnimatePresence>
      {/* Calendar Subscription Modal */}
      <AnimatePresence>
        {showCalendarModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/70 backdrop-blur-sm z-50 flex items-center justify-center p-4"
            onClick={() => setShowCalendarModal(false)}
          >
            <motion.div
              initial={{ scale: 0.9, opacity: 0, y: 20 }}
              animate={{ scale: 1, opacity: 1, y: 0 }}
              exit={{ scale: 0.9, opacity: 0, y: 20 }}
              className="card-glass p-6 max-w-lg w-full border border-white/[0.1] shadow-2xl shadow-black/50"
              onClick={(e) => e.stopPropagation()}
            >
              <div className="flex items-center justify-between mb-6">
                <h2 className="text-lg font-bold flex items-center gap-2 text-white">
                  <CalendarDaysIcon className="w-6 h-6 text-white" />
                  Calendar Sync
                </h2>
                <button onClick={() => setShowCalendarModal(false)} className="text-white/40 hover:text-white p-2 transition-colors cursor-pointer">
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <p className="text-sm text-white/50 mb-6">
                Subscribe once — all future reviews will automatically appear in your calendar.
              </p>

              {/* Apple Calendar */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-white">🍎 Apple Calendar (Mac/iPhone)</h3>
                <a
                  href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar`}
                  className="flex items-center justify-center gap-2 w-full py-4 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-sm font-medium text-white transition-all border border-white/[0.12]"
                >
                  <CalendarDaysIcon className="w-4 h-4" />
                  Subscribe in Apple Calendar
                </a>
                <p className="text-xs text-white/30 mt-2 ml-2">
                  <strong className="text-white/50">Hinweis für lokales Testen:</strong> Apple blockiert 1-Click Abos ohne HTTPS. Für ein Live-Abo füge <code className="bg-white/[0.06] px-2 py-0 rounded text-white/40">http://localhost:3000/api/calendar</code> manuell in Apple Calendar ein. Im Live-Betrieb funktioniert der Button automatisch.
                </p>
              </div>

              {/* Google Calendar */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-white">📅 Google Calendar</h3>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/calendar`}
                    className="input-dark flex-1 px-4 py-2 text-xs font-mono truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/calendar`);
                      setCalendarUrlCopied(true);
                      setTimeout(() => setCalendarUrlCopied(false), 2000);
                    }}
                    className="px-4 py-2 btn-secondary rounded-xl text-xs font-medium flex items-center gap-2"
                  >
                    {calendarUrlCopied ? <CheckIcon className="w-4 h-4 text-emerald-400" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                    {calendarUrlCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-2 ml-2">
                  Google Calendar → Other calendars (+) → From URL → Paste the URL above.
                </p>
              </div>

              {/* Done Calendar */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-white">🟢 Done Calendar (Optional)</h3>
                <a
                  href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar/done`}
                  className="flex items-center justify-center gap-2 w-full py-2 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-xs font-medium text-emerald-400 transition-all border border-emerald-500/20"
                >
                  <CalendarDaysIcon className="w-4 h-4" />
                  Subscribe to Log History
                </a>
                <p className="text-[10px] text-white/30 mt-2 ml-2">
                  Track your daily progress by subscribing to your completed reviews.
                </p>
              </div>

              {/* One-time download fallback */}
              <div className="pt-4 border-t border-white/[0.06]">
                <a
                  href="/api/calendar"
                  download="srs-reviews.ics"
                  className="flex items-center justify-center gap-2 w-full py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl text-xs font-medium text-white/40 hover:text-white/60 transition-all border border-white/[0.06]"
                >
                  <DocumentTextIcon className="w-4 h-4" />
                  Download .ics file (one-time import)
                </a>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>
      </div>

      {/* Settings / Semester Modal */}
      <AnimatePresence>
        {showSettingsModal && (
          <motion.div
            initial={{ opacity: 0 }}
            animate={{ opacity: 1 }}
            exit={{ opacity: 0 }}
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-sm"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="bg-[#0a0a0a] rounded-2xl p-6 w-full max-w-lg shadow-2xl border border-white/[0.08]"
            >
              <div className="flex justify-between items-center mb-6">
                <h3 className="text-xl font-bold text-white flex items-center gap-2">
                  <AcademicCapIcon className="w-6 h-6 text-accent-1" />
                  {language === "german" ? "Semester-Einstellungen" : "Semester Settings"}
                </h3>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-white/[0.06] rounded-full transition-colors text-white/50"
                >
                  <XMarkIcon className="w-6 h-6" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">{language === "german" ? "Aktueller Status" : "Current Status"}</h4>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">Semester {currentSemester}</div>
                      <div className="text-sm text-white/40">{language === "german" ? "Aktiver Studienzeitraum" : "Active study period"}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">{language === "german" ? "Modul-Voreinstellungen" : "Module Presets"}</h4>
                  <div className="space-y-2 mb-4">
                    {modulePresets.length === 0 ? (
                      <div className="text-white/30 text-sm italic py-2">No modules defined yet.</div>
                    ) : (
                      modulePresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] p-4 rounded-lg">
                          <span className="text-white text-sm">{preset}</span>
                          <button 
                            onClick={() => {
                              const newPresets = modulePresets.filter((_, i) => i !== idx);
                              fetch('/api/settings', {
                                method: 'POST',
                                headers: { 'Content-Type': 'application/json' },
                                body: JSON.stringify({ action: 'update_presets', presets: newPresets })
                              }).then(res => res.json()).then(data => {
                            if (data.error) {
                              alert(`Error: ${data.error}`);
                              return;
                            }
                            setModulePresets(data.modulePresets || []);
                            if (subjectInput === preset) setSubjectInput((data.modulePresets && data.modulePresets[0]) || "");
                              });
                            }}
                            className="text-white/30 hover:text-red-400 transition-colors"
                          >
                            <XMarkIcon className="w-4 h-4" />
                          </button>
                        </div>
                      ))
                    )}
                  </div>
                  <div className="flex gap-2">
                    <input 
                      type="text" 
                      value={newPresetInput}
                      onChange={e => setNewPresetInput(e.target.value)}
                      onKeyDown={e => {
                        if (e.key === 'Enter' && newPresetInput.trim()) {
                          const newPresets = [...modulePresets, newPresetInput.trim()];
                          fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'update_presets', presets: newPresets })
                          }).then(res => res.json()).then(data => {
                            if (data.error) {
                              alert(`Error: ${data.error}`);
                              return;
                            }
                            setModulePresets(data.modulePresets || []);
                            if (!subjectInput) setSubjectInput(newPresetInput.trim());
                            setNewPresetInput("");
                          });
                        }
                      }}
                      placeholder={language === "german" ? "z.B. Lineare Algebra" : "e.g. Linear Algebra"}
                      className="input-dark flex-1 px-4 py-2 text-sm"
                    />
                    <button 
                      onClick={() => {
                        if (newPresetInput.trim()) {
                          const newPresets = [...modulePresets, newPresetInput.trim()];
                          fetch('/api/settings', {
                            method: 'POST',
                            headers: { 'Content-Type': 'application/json' },
                            body: JSON.stringify({ action: 'update_presets', presets: newPresets })
                          }).then(res => res.json()).then(data => {
                            if (data.error) {
                              alert(`Error: ${data.error}`);
                              return;
                            }
                            setModulePresets(data.modulePresets || []);
                            if (!subjectInput) setSubjectInput(newPresetInput.trim());
                            setNewPresetInput("");
                          });
                        }
                      }}
                      className="bg-white/[0.06] hover:bg-white/[0.1] text-white px-4 py-2 rounded-lg text-sm transition-colors border border-white/[0.08]"
                    >
                      {language === "german" ? "Hinzufügen" : "Add"}
                    </button>
                  </div>
                </div>

                <div className="pt-4 mt-6 border-t border-white/[0.08]">
                  <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-4">{language === "german" ? "Sprache" : "Language Setting"}</h4>
                  <div className="flex gap-2">
                    <button 
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'german' })
                        }).then(res => res.json()).then(data => {
                          if (!data.error && data.language) setLanguage(data.language);
                        });
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm transition-colors border ${language === 'german' ? 'bg-white/[0.1] border-white/[0.2] text-white' : 'bg-transparent border-white/[0.08] text-white/50 hover:bg-white/[0.04]'}`}
                    >
                      German
                    </button>
                    <button 
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_language', language: 'english' })
                        }).then(res => res.json()).then(data => {
                          if (!data.error && data.language) setLanguage(data.language);
                        });
                      }}
                      className={`flex-1 py-2 rounded-lg text-sm transition-colors border ${language === 'english' ? 'bg-white/[0.1] border-white/[0.2] text-white' : 'bg-transparent border-white/[0.08] text-white/50 hover:bg-white/[0.04]'}`}
                    >
                      English
                    </button>
                  </div>
                </div>

                <div className="pt-4 mt-6 border-t border-white/[0.08]">
                  <h4 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">{language === "german" ? "Gefahrenzone" : "Danger Zone"}</h4>
                  <p className="text-white/40 text-xs mb-4">{language === "german" ? "Der Start eines neuen Semesters erhöht den Semesterzähler und löscht deine aktuellen Modul-Voreinstellungen." : "Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh."}</p>
                  <button 
                    onClick={() => {
                      if (confirm("Are you sure you want to start a new semester? Your presets will be reset.")) {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'new_semester' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            alert(`Error: ${data.error}`);
                            return;
                          }
                          setCurrentSemester(data.currentSemester);
                          setModulePresets(data.modulePresets || []);
                          setSubjectInput("");
                        });
                      }
                    }}
                    className="w-full py-4 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                  >
                    <ExclamationTriangleIcon className="w-4 h-4" />
                    {language === "german" ? `Neues Semester starten (Semester ${currentSemester + 1})` : `Start New Semester (Semester ${currentSemester + 1})`}
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm("Are you absolutely sure you want to reset back to Semester 1? Your presets will be wiped.")) {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'reset_semester' })
                        }).then(res => res.json()).then(data => {
                          if (data.error) {
                            alert(`Error: ${data.error}`);
                            return;
                          }
                          setCurrentSemester(data.currentSemester);
                          setModulePresets(data.modulePresets || []);
                          setSubjectInput("");
                        });
                      }
                    }}
                    className="w-full py-2 bg-transparent hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    {language === "german" ? "Auf Semester 1 zurücksetzen" : "Reset to Semester 1"}
                  </button>
                </div>
              </div>
            </motion.div>
          </motion.div>
        )}
      </AnimatePresence>

    </div>
  );
}
