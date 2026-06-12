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
  BellSlashIcon,
  SpeakerWaveIcon,
  VideoCameraIcon,
  LockClosedIcon
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
  const [wrapperMode, setWrapperMode] = useState<string>("all");
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [showMobileMenu, setShowMobileMenu] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState("");

  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCurrentSemester(data.currentSemester);
          if (data.modulePresets) setModulePresets(data.modulePresets);
          if (data.language) setLanguage(data.language);
          if (data.wrapperMode) setWrapperMode(data.wrapperMode);
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

      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || ""; // Keep the last partial line in the buffer

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
      let buffer = "";

      while (!done) {
        const { value, done: doneReading } = await reader.read();
        done = doneReading;
        if (value) {
          buffer += decoder.decode(value, { stream: true });
          const lines = buffer.split("\n");
          buffer = lines.pop() || "";

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
    <div className="min-h-screen bg-transparent flex font-sans">

      {/* Print-Only Wrapper */}
      {activeTab === "quiz" && selectedReview && parsedTasks.length > 0 && (
        <div className="hidden print:block p-4 md:p-8 w-full bg-white text-black">
          <div className="max-w-3xl mx-auto">
            <div className="border-b-2 border-zinc-200 pb-6 mb-8">
              <h1 className="text-2xl font-bold font-sans text-zinc-900 mb-2">{selectedReview.topic}</h1>
              <p className="text-xs text-zinc-500 font-medium">
                <span className="bg-zinc-900 text-zinc-100 px-2 py-0.5 rounded mr-2 font-bold uppercase tracking-wider">Level {selectedReview.level + 1}</span>
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
                    <h2 className="text-sm font-bold text-zinc-900 uppercase tracking-wider mb-2">{task.label}</h2>
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
        <div className="md:hidden flex items-center justify-between px-5 py-4 border-b border-white/[0.07] bg-[#0e0c0a]/90 backdrop-blur-xl sticky top-0 z-50">
          <div className="flex items-center gap-3">
            <div className="w-9 h-9 rounded-xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_4px_16px_-4px_rgba(245,158,11,0.6)]">
              <CpuChipIcon className="text-stone-950 w-4.5 h-4.5" strokeWidth={2} />
            </div>
            <h1 className="font-display text-xl font-medium tracking-tight text-white">SRS<span className="text-gradient italic">Master</span></h1>
          </div>
          <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 text-white/50 hover:text-white cursor-pointer">
            {showMobileMenu ? <XMarkIcon className="w-6 h-6" /> : <Bars3Icon className="w-6 h-6" />}
          </button>
        </div>

        {/* Sidebar */}
        <motion.aside
          initial={{ x: -300, opacity: 0 }}
          animate={{ x: 0, opacity: 1 }}
          transition={{ duration: 0.5, ease: "easeOut" }}
          className={`${showMobileMenu ? 'flex' : 'hidden'} md:flex w-full md:w-[268px] sidebar-gradient border-r border-white/[0.07] flex-col px-5 py-6 sticky md:top-0 h-[calc(100vh-69px)] md:h-screen z-40 overflow-y-auto custom-scrollbar`}
        >
          <div className="hidden md:flex items-center gap-3.5 mb-10 px-1">
            <div className="w-11 h-11 rounded-2xl bg-gradient-to-br from-amber-300 to-amber-600 flex items-center justify-center shadow-[0_6px_20px_-6px_rgba(245,158,11,0.65)] ring-1 ring-amber-200/40">
              <CpuChipIcon className="text-stone-950 w-5 h-5" strokeWidth={2} />
            </div>
            <div className="flex flex-col">
              <h1 className="font-display text-[22px] font-medium tracking-tight leading-none text-white">SRS<span className="text-gradient italic">Master</span></h1>
              <div className="mt-2 text-[10px] font-bold uppercase tracking-[0.18em] text-amber-200/70 bg-amber-400/[0.08] px-2.5 py-1 rounded-full border border-amber-400/15 self-start">
                Semester {currentSemester}
              </div>
            </div>
          </div>

          <nav className="flex flex-col gap-1.5">
            <button onClick={() => { setActiveTab("dashboard"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CalendarDaysIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">Dashboard</span>
            </button>
            <button onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'upload' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <CloudArrowUpIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</span>
            </button>
            <button onClick={() => { setActiveTab("library"); setShowMobileMenu(false); }} className={`flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer ${activeTab === 'library' ? 'nav-item-active' : 'nav-item-idle'}`}>
              <BookOpenIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Bibliothek' : 'Library'}</span>
            </button>
            <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className="flex items-center gap-3.5 px-4 py-3 transition-all duration-200 cursor-pointer nav-item-idle">
              <Cog8ToothIcon className="w-5 h-5 shrink-0" />
              <span className="text-sm font-medium whitespace-nowrap">{language === 'german' ? 'Einstellungen' : 'Settings'}</span>
            </button>
          </nav>

          <div className="mt-auto flex flex-col gap-4 pt-8">
            {/* Push Notification Toggle */}
            <button
              onClick={togglePush}
              className={`flex items-center gap-3.5 px-4 py-3 rounded-xl transition-all duration-200 cursor-pointer border ${
                pushPermission === "granted" && pushSubscribed
                  ? "bg-emerald-400/[0.08] text-emerald-300 border-emerald-400/20"
                  : "nav-item-idle border-white/[0.07]"
              }`}
            >
              {pushPermission === "granted" && pushSubscribed ? (
                <BellIcon className="w-5 h-5 shrink-0" />
              ) : (
                <BellSlashIcon className="w-5 h-5 shrink-0" />
              )}
              <span className="font-medium text-sm whitespace-nowrap">
                {pushPermission === "granted" && pushSubscribed
                  ? language === "german" ? "Mitteilungen an" : "Notifications On"
                  : pushPermission === "denied"
                  ? language === "german" ? "Blockiert" : "Notifications Blocked"
                  : language === "german" ? "Mitteilungen erlauben" : "Enable Notifications"}
              </span>
            </button>

            <div className="gradient-border rounded-2xl bg-gradient-to-b from-amber-400/[0.07] via-transparent to-transparent p-5 relative overflow-hidden">
              <SparklesIcon className="w-5 h-5 text-amber-300 mb-3" />
              <h3 className="font-display text-base font-medium text-white mb-1.5">Live Tutor Pro</h3>
              <p className="text-xs text-white/40 leading-relaxed mb-4">{language === "german" ? "Optimiere dein Lernen mit Sprach-KI." : "Upgrade your learning with voice AI."}</p>
              <button className="w-full py-2.5 bg-white/[0.04] rounded-lg text-xs font-medium border border-white/[0.08] text-white/30 cursor-not-allowed transition-colors flex items-center justify-center gap-2">
                <LockClosedIcon className="w-3.5 h-3.5" />
                {language === "german" ? "Freischalten (Phase 2)" : "Unlock (Phase 2)"}
              </button>
            </div>
          </div>
        </motion.aside>

        {/* Main Content */}
        <main className={`${showMobileMenu ? "hidden" : "block"} md:block flex-1 px-4 py-8 md:px-12 md:py-12 overflow-y-auto relative h-[calc(100vh-69px)] md:h-screen`}>
          <AnimatePresence mode="wait">
            {activeTab === "dashboard" && (
              <motion.div
                key="dash"
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                className="max-w-5xl mx-auto"
              >
                <header className="mb-8 md:mb-14 flex justify-between items-end">
                  <div>
                    <p className="eyebrow mb-3">{language === 'german' ? 'Willkommen zurück' : 'Welcome back'}</p>
                    <h1 className="font-display text-3xl sm:text-[2.75rem] font-medium tracking-tight text-white leading-[1.08] mb-3">
                      {language === 'german'
                        ? <>Bereit für das <em className="text-gradient not-italic font-display italic">nächste Level</em>?</>
                        : <>Ready to <em className="text-gradient not-italic font-display italic">level up</em>?</>}
                    </h1>
                    <p className="text-white/45 text-sm sm:text-base">{language === 'german' ? `Du hast ${upcomingReviews.filter(r => r.isDue).length} Wiederholungen heute.` : `You have ${upcomingReviews.filter(r => r.isDue).length} reviews due today.`}</p>
                  </div>
                </header>

                <div className="grid grid-cols-1 lg:grid-cols-3 gap-5 md:gap-8">
                  {/* Reviews List */}
                  <div className="lg:col-span-2 flex flex-col gap-4">
                    <div className="flex flex-col sm:flex-row sm:items-center justify-between mb-3 gap-3">
                      <h3 className="font-display text-xl sm:text-2xl font-medium text-white flex items-center gap-2.5">
                        <ClockIcon className="w-5 h-5 text-amber-300" />
                        {language === 'german' ? 'Anstehende Wiederholungen' : 'Upcoming Reviews'}
                      </h3>
                      <button
                        onClick={() => setShowCalendarModal(true)}
                        className="btn-secondary flex items-center justify-center gap-2 px-4 py-2.5 text-xs cursor-pointer w-full sm:w-auto"
                      >
                        <CalendarDaysIcon className="w-4 h-4 text-amber-300" />
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
                          <div className="card-surface p-8 md:p-14 text-center text-white/40 text-sm leading-relaxed">
                            {language === 'german' ? 'Keine Wiederholungen gefunden. Lade Vorlesungsmaterial hoch, um dein erstes Quiz zu erstellen!' : 'No reviews found. Upload lecture material to generate your first quiz!'}
                          </div>
                        );
                      }

                      return (
                        <>
                          {itemsToRender.map((review, i) => (
                            <motion.div
                              key={review.id}
                              initial={{ opacity: 0, y: 14 }}
                              animate={{ opacity: 1, y: 0 }}
                              transition={{ duration: 0.4, delay: Math.min(i, 8) * 0.05, ease: "easeOut" }}
                              onClick={() => startQuiz(review)}
                              className={`card-surface-elevated p-5 sm:p-6 transition-all duration-300 group cursor-pointer relative overflow-hidden ${review.isDue ? 'border-amber-400/30 hover:border-amber-300/50 shadow-[0_0_28px_-8px_rgba(245,158,11,0.3)]' : ''}`}
                            >
                              {/* Ember spine — lit when due, faint on hover otherwise */}
                              <div className={`absolute left-0 top-0 bottom-0 w-[3px] rounded-r transition-opacity duration-300 ${review.isDue ? 'bg-gradient-to-b from-amber-200 via-amber-400 to-amber-600 opacity-100' : 'bg-white/30 opacity-0 group-hover:opacity-50'}`}></div>

                              <div className="flex justify-between items-start pl-2.5">
                                <div className="flex-1 min-w-0 pr-4">
                                  <div className="flex flex-wrap items-center gap-2 mb-3">
                                    <span className={`text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md ${review.isDue ? 'badge-due' : 'badge-level'}`}>Level {review.level + 1}</span>
                                    <span className="text-[10px] font-semibold text-white/45 bg-white/[0.04] px-2.5 py-1 rounded-full border border-white/[0.08]">
                                      Sem {review.semester}
                                    </span>
                                    <div className="text-right">
                                      {review.isDue ? (
                                        <span className="inline-flex items-center px-2.5 py-1 rounded-md bg-amber-400/10 text-amber-200 border border-amber-400/25 text-[10px] font-bold uppercase tracking-[0.12em]">
                                          <span className="ember-dot w-1.5 h-1.5 rounded-full bg-amber-300 mr-2"></span>
                                          {language === 'german' ? 'JETZT FÄLLIG' : 'DUE NOW'}
                                        </span>
                                      ) : (
                                        <span className="text-xs text-white/35">{language === 'german' ? `Geplant: ${review.dueDate}` : `Scheduled: ${review.dueDate}`}</span>
                                      )}
                                    </div>
                                  </div>
                                  <h4 className="font-display text-xl font-medium text-white truncate tracking-tight">{review.subject}</h4>
                                  <p className="text-sm text-white/40 truncate mt-0.5">{review.topic}</p>

                                  {review.raw.lastFeedback && (
                                    <button
                                      onClick={(e) => {
                                        e.stopPropagation();
                                        setActiveFeedbackItem(review.raw);
                                        setFeedbackTab("brief");
                                      }}
                                      className="mt-4 text-xs bg-white/[0.04] hover:bg-white/[0.07] border border-white/[0.09] hover:border-white/[0.16] text-white/55 hover:text-white/80 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                                    >
                                      <DocumentTextIcon className="w-4 h-4 text-amber-300/80" />
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
                                            className="mt-2 text-xs bg-indigo-400/[0.07] hover:bg-indigo-400/[0.14] border border-indigo-400/20 text-indigo-300 px-3.5 py-2 rounded-lg flex items-center gap-2 transition-all cursor-pointer"
                                          >
                                            <ClockIcon className="w-4 h-4" />
                                            View Video Archive ({archiveVideos.length})
                                          </button>
                                        )}

                                        <div className="mt-6">
                                          <div className="text-[10px] font-bold text-white/30 uppercase mb-2.5 pl-0.5 tracking-[0.2em]">
                                            {language === 'german' ? 'Lernmaterialien' : 'Study Materials'}
                                          </div>
                                          <div className="grid grid-cols-1 sm:grid-cols-3 gap-2.5 p-3 bg-black/30 rounded-2xl border border-white/[0.05]">
                                            {/* PRE-PODCAST */}
                                            <div className="flex-1 min-w-0">
                                              <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Vorbereitung" : "Pre-Lecture"}</h5>
                                              {review.raw.prePodcastUrl && review.raw.prePodcastUrl.startsWith("http") ? (
                                                <a
                                                  href={review.raw.prePodcastUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="text-xs bg-white/[0.06] hover:bg-amber-400/[0.12] border border-white/10 hover:border-amber-400/35 text-white px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                                >
                                                  <SpeakerWaveIcon className="w-4 h-4 shrink-0 text-amber-300" />
                                                  Audio 1
                                                </a>
                                              ) : (
                                                <div className="text-[10px] font-medium bg-white/[0.02] border border-dashed border-white/10 text-white/30 px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center">
                                                  <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/60 shrink-0"></span>
                                                  {language === 'german' ? 'Wird generiert' : 'Generating'}
                                                </div>
                                              )}
                                            </div>

                                            {/* POST-PODCAST */}
                                            <div className="flex-1 min-w-0">
                                              <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Nachbereitung" : "Post-Lecture"}</h5>
                                              {review.raw.postPodcastUrl && review.raw.postPodcastUrl.startsWith("http") ? (
                                                <a
                                                  href={review.raw.postPodcastUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="text-xs bg-white/[0.06] hover:bg-amber-400/[0.12] border border-white/10 hover:border-amber-400/35 text-white px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                                >
                                                  <SpeakerWaveIcon className="w-4 h-4 shrink-0 text-amber-300" />
                                                  Audio 2
                                                </a>
                                              ) : (
                                                <div className="text-[10px] font-medium bg-white/[0.02] border border-dashed border-white/10 text-white/30 px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center">
                                                  <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/60 shrink-0"></span>
                                                  {language === 'german' ? 'Wird generiert' : 'Generating'}
                                                </div>
                                              )}
                                            </div>

                                            {/* VIDEO STUDIO */}
                                            <div className="flex-1 min-w-0">
                                              <h5 className="text-[10px] font-bold text-white/30 uppercase tracking-[0.14em] mb-2 truncate">{language === "german" ? "Videostudio" : "Video Studio"}</h5>
                                              {!isWaitingForNewVideo && latestVideoUrl && latestVideoUrl.startsWith("http") ? (
                                                <a
                                                  href={latestVideoUrl}
                                                  target="_blank"
                                                  rel="noopener noreferrer"
                                                  onClick={(e) => e.stopPropagation()}
                                                  className="text-xs bg-emerald-400/[0.08] hover:bg-emerald-400/[0.16] border border-emerald-400/25 hover:border-emerald-300/45 text-emerald-200 px-2 py-2.5 rounded-lg flex items-center justify-center gap-2 transition-all w-full font-medium truncate"
                                                >
                                                  <VideoCameraIcon className="w-4 h-4 shrink-0" />
                                                  Video
                                                </a>
                                              ) : (
                                                <div className="text-[10px] font-medium bg-white/[0.02] border border-dashed border-white/10 text-white/30 px-2 py-2.5 rounded-lg flex items-center gap-2 w-full justify-center text-center">
                                                  <span className="ember-dot w-1 h-1 rounded-full bg-amber-400/60 shrink-0"></span>
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
                                  <button className="hidden sm:flex w-11 h-11 rounded-full items-center justify-center transition-all bg-white/[0.04] border border-white/[0.07] text-white/40 group-hover:bg-amber-400/15 group-hover:border-amber-400/30 group-hover:text-amber-200 group-hover:scale-110 cursor-pointer">
                                    <ChevronRightIcon className="w-5 h-5" />
                                  </button>
                                  <button
                                    onClick={(e) => handleDeleteModule(e, review.id)}
                                    className="w-10 h-10 sm:w-11 sm:h-11 rounded-full flex items-center justify-center transition-all bg-white/[0.04] border border-white/[0.07] text-white/35 hover:bg-rose-500/15 hover:border-rose-400/30 hover:text-rose-300 cursor-pointer"
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
                              className="w-full mt-2 py-4 rounded-2xl card-surface flex items-center justify-center gap-2 text-sm text-white/45 hover:text-amber-200 transition-all cursor-pointer font-medium"
                            >
                              <ChevronDownIcon className="w-4 h-4" />
                              {language === 'german' ? `Alle ${scheduledItems.length} anstehenden anzeigen` : `Show all ${scheduledItems.length} upcoming`}
                            </button>
                          )}
                        </>
                      );
                    })()}
                  </div>

                  {/* Quick Actions */}
                  <div className="flex flex-col gap-6">
                    <motion.div className="card-surface-elevated gradient-border p-6 cursor-pointer transition-colors" onClick={() => { setActiveTab("upload"); setShowMobileMenu(false); }}>
                      <p className="eyebrow mb-3">Pipeline</p>
                      <h3 className="font-display text-xl font-medium mb-2 text-white">{language === 'german' ? 'Material hochladen' : 'Upload Material'}</h3>
                      <p className="text-sm text-white/40 leading-relaxed mb-6">{language === 'german' ? 'Füttere die KI mit einem neuen Modul, um den generativen 6-Stufen-Prozess zu starten.' : 'Feed the engine a new module to start the 6-stage generative AI pipeline.'}</p>
                      <button className="btn-primary w-full py-3.5 px-4 text-sm flex items-center justify-center gap-2 cursor-pointer">
                        <CloudArrowUpIcon className="w-5 h-5" />
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
                <header className="mb-10">
                  <p className="eyebrow mb-3">6-Stage Pipeline</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">Ironclad <em className="text-gradient italic">Generator</em></h1>
                  <p className="text-white/45 text-sm sm:text-base">{language === 'german' ? 'Füge dein Vorlesungsmaterial hier ein, um den kompletten didaktischen KI-Prozess zu starten.' : 'Paste your lecture material below to run the full 6-stage Didactic AI chain.'}</p>
                </header>

                {isGenerating ? (
                  <div className="card-surface-elevated p-8 md:p-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center mb-6">
                      <ArrowPathIcon className="w-8 h-8 text-amber-300 animate-spin" />
                    </div>
                    <h3 className="font-display text-2xl font-medium text-white mb-2">Processing Module...</h3>
                    <p className="text-white/50 mb-10 text-base">{progressMsg}</p>

                    <div className="progress-track w-full max-w-md h-2.5">
                      <motion.div
                        className="progress-fill h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${(progressStep / 8) * 100}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="w-full max-w-md mt-8 text-left space-y-3.5">
                      {[1,2,3,4,5,6,7].map(step => (
                        <div key={step} className={`flex items-center gap-3.5 text-sm ${progressStep > step ? 'text-emerald-300' : progressStep === step ? 'text-amber-200 font-medium' : 'text-white/20'}`}>
                          {progressStep > step ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : progressStep === step ? <span className="ember-dot w-5 h-5 rounded-full border-2 border-amber-300 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span></span> : <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />}
                          {step === 1 ? "Blueprint Engine" : step === 7 ? "Tutor Prompt Engine" : `Quiz Agent (Level ${step-1})`}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : (
                  <div className="card-surface-elevated p-5 md:p-8 flex flex-col gap-7">
                    <div className="flex flex-col sm:flex-row gap-5">
                      <div className="flex-1 flex flex-col justify-end">
                        <div className="flex items-start justify-between mb-2 gap-2">
                          <label className="text-xs font-semibold uppercase tracking-[0.12em] text-white/45 leading-tight">{language === "german" ? `Modul (Semester ${currentSemester})` : `Module (Semester ${currentSemester})`}</label>
                          <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className="text-xs text-amber-300/80 hover:text-amber-200 transition-colors shrink-0 cursor-pointer">{language === "german" ? "Verwalten" : "Manage Presets"}</button>
                        </div>
                        {modulePresets.length > 0 ? (
                          <select
                            value={subjectInput}
                            onChange={e => setSubjectInput(e.target.value)}
                            className="input-dark w-full px-4 py-3.5 appearance-none cursor-pointer"
                          >
                            {modulePresets.map(preset => (
                              <option key={preset} value={preset} className="bg-[#16120e]">{preset}</option>
                            ))}
                          </select>
                        ) : (
                          <div className="input-dark w-full px-4 py-3.5 text-white/45 text-sm flex items-center justify-between gap-2">
                            {language === "german" ? `Keine Module für Semester ${currentSemester} definiert` : `No modules defined for Semester ${currentSemester}`}
                            <button onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }} className="text-amber-300 hover:text-amber-200 font-medium cursor-pointer shrink-0">{language === "german" ? "Hinzufügen" : "Add Presets"}</button>
                          </div>
                        )}
                      </div>
                      <div className="flex-1 flex flex-col justify-end">
                        <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/45 mb-2">{language === "german" ? "Thema" : "Topic"}</label>
                        <input
                          type="text"
                          value={topicInput}
                          onChange={e => setTopicInput(e.target.value)}
                          placeholder="e.g. Memory & Motivation"
                          className="input-dark w-full px-4 py-3.5"
                        />
                      </div>
                    </div>
                    <div>
                      <label className="block text-xs font-semibold uppercase tracking-[0.12em] text-white/45 mb-2.5">{language === "german" ? "Vorlesungsmaterial (Dateien oder Text)" : "Lecture Material (Files or Text)"}</label>
                      <div
                        className={`w-full border-2 border-dashed rounded-2xl p-6 md:p-10 mb-4 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-amber-400/60 bg-amber-400/[0.05]' : 'border-white/[0.1] bg-white/[0.015]'}`}
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
                        <div className="w-12 h-12 rounded-xl bg-amber-400/[0.08] border border-amber-400/20 flex items-center justify-center mb-4">
                          <CloudArrowUpIcon className="w-6 h-6 text-amber-300" />
                        </div>
                        <p className="text-white/40 text-sm text-center mb-4 leading-relaxed">
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
                        <label htmlFor="file-upload" className="btn-secondary px-4 py-2 text-sm cursor-pointer">
                          {language === "german" ? "Dateien durchsuchen" : "Browse Files"}
                        </label>
                      </div>

                      {uploadedFiles.length > 0 && (
                        <div className="flex flex-wrap gap-2 mb-4">
                          {uploadedFiles.map((file, idx) => (
                            <div key={idx} className="flex items-center gap-2 bg-amber-400/[0.07] text-amber-100/90 px-3.5 py-2 rounded-lg text-xs font-medium border border-amber-400/20">
                              <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                              {file.name}
                              <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))} className="ml-1.5 text-amber-200/60 hover:text-white cursor-pointer">
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
                        className="input-dark w-full px-4 py-4 h-32 resize-none text-sm leading-relaxed"
                      />
                    </div>
                    <button
                      onClick={handleGenerate}
                      disabled={(!textInput && uploadedFiles.length === 0) || !subjectInput}
                      className="btn-primary w-full py-4 text-sm flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                    >
                      <CpuChipIcon className="w-5 h-5" />
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
                <header className="mb-8 md:mb-14">
                  <p className="eyebrow mb-3">Archive</p>
                  <h1 className="font-display text-3xl sm:text-4xl font-medium tracking-tight text-white mb-3">{language === "german" ? "Meine Bibliothek" : "My Library"}</h1>
                  <p className="text-white/45 text-sm sm:text-base">{language === "german" ? "Überprüfe deine gespeicherten Module, Tutor-Prompts und Lernpläne." : "Review your stored modules, tutor prompts, and generating schedules."}</p>
                </header>
                <div className="card-surface p-8 md:p-14 text-center text-white/40 text-sm leading-relaxed">
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
                  className="flex items-center gap-2 text-sm text-white/40 hover:text-amber-200 mb-8 transition-colors cursor-pointer"
                >
                  <ArrowLeftIcon className="w-4 h-4" />
                  {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
                </button>

                <header className="mb-10">
                  <div className="flex items-center gap-3 mb-4">
                    <span className="text-[10px] font-bold uppercase tracking-[0.12em] px-2.5 py-1 rounded-md badge-due">Level {selectedReview.level + 1}</span>
                    <span className="eyebrow !text-white/35">{language === "german" ? "Aktives Quiz" : "Active Quiz"}</span>
                  </div>
                  <div className="flex items-start justify-between gap-4">
                    <div>
                      <h1 className="font-display text-2xl sm:text-3xl font-medium tracking-tight text-white">{selectedReview.subject}</h1>
                      <p className="text-sm text-white/40 mt-2">{selectedReview.topic}</p>
                    </div>
                    {parsedTasks.length > 0 && (
                      <motion.button
                        whileHover={{ scale: 1.04 }}
                        whileTap={{ scale: 0.96 }}
                        onClick={exportQuizForPrint}
                        className="btn-secondary flex items-center gap-2 px-4 py-2.5 text-xs font-semibold cursor-pointer shrink-0"
                      >
                        <PrinterIcon className="w-4 h-4 text-amber-300" />
                        Exportieren
                      </motion.button>
                    )}
                  </div>
                </header>

                {gradingError && !isGrading && (
                  <div className="mb-6 p-6 rounded-2xl bg-rose-500/[0.07] border border-rose-400/20 text-rose-200 text-sm flex flex-col gap-3">
                    <div className="flex items-center gap-2 text-rose-300 font-semibold">
                      <ExclamationTriangleIcon className="w-5 h-5" />
                      <span>Grading Failed</span>
                    </div>
                    <pre className="text-xs font-mono bg-black/30 p-4 rounded-xl border border-white/[0.06] whitespace-pre-wrap overflow-x-auto max-h-40 overflow-y-auto leading-relaxed text-left text-rose-200/70 custom-scrollbar">
                      {gradingError}
                    </pre>
                    <p className="text-xs text-white/35 text-left leading-relaxed">
                      Please check your database, Gemini API key, or server logs, and click below to try submitting again.
                    </p>
                  </div>
                )}

                {isGrading ? (
                  <div className="card-surface-elevated p-8 md:p-14 flex flex-col items-center justify-center text-center">
                    <div className="w-16 h-16 rounded-2xl bg-amber-400/10 border border-amber-400/25 flex items-center justify-center mb-6">
                      <ArrowPathIcon className="w-8 h-8 text-amber-300 animate-spin" />
                    </div>
                    <h3 className="font-display text-2xl font-medium mb-2 text-white">Grading Submission...</h3>
                    <p className="text-white/50 mb-10 text-base">{gradingMsg}</p>

                    <div className="progress-track w-full max-w-md h-2.5">
                      <motion.div
                        className="progress-fill h-full"
                        initial={{ width: 0 }}
                        animate={{ width: `${Math.min(100, (gradingStep / 4) * 100)}%` }}
                        transition={{ duration: 0.5 }}
                      />
                    </div>
                    <div className="w-full max-w-md mt-8 text-left space-y-3.5">
                      {[1,2,3,4].map(step => (
                        <div key={step} className={`flex items-center gap-3.5 text-sm ${gradingStep > step ? 'text-emerald-300' : gradingStep === step ? 'text-amber-200 font-medium' : 'text-white/20'}`}>
                          {gradingStep > step ? <CheckCircleIcon className="w-5 h-5 shrink-0" /> : gradingStep === step ? <span className="ember-dot w-5 h-5 rounded-full border-2 border-amber-300 shrink-0 flex items-center justify-center"><span className="w-1.5 h-1.5 rounded-full bg-amber-300"></span></span> : <div className="w-5 h-5 rounded-full border-2 border-current shrink-0" />}
                          {step === 1 ? "Co-Prüfer 1 & 2 (Parallel Evaluation)" :
                           step === 2 ? "Chef-Prüfer (Consolidation & Brief)" :
                           step === 3 ? "Follow-Up Generation (Quiz & Video)" : "Saving Database Records"}
                        </div>
                      ))}
                    </div>
                  </div>
                ) : gradingResult ? (
                  <div className="space-y-6">
                    <div className={`card-surface-elevated p-6 md:p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${gradingResult.isPass ? 'border-emerald-400/25 glow-success' : 'border-rose-400/25 glow-danger'}`}>
                      <div>
                        <span className={`text-[10px] font-bold uppercase tracking-[0.16em] px-3.5 py-1.5 rounded-full ${gradingResult.isPass ? 'bg-emerald-400/12 text-emerald-300 border border-emerald-400/25' : 'bg-rose-400/12 text-rose-300 border border-rose-400/25'}`}>
                          {gradingResult.isPass ? "PASS (Bestanden)" : "REPEAT (Wiederholen)"}
                        </span>
                        <h2 className="font-display text-3xl sm:text-4xl font-medium text-white mt-5 tracking-tight">
                          {gradingResult.isPass
                            ? <>Level <em className="text-gradient italic">Promoted!</em></>
                            : <>Remediation <em className="italic text-rose-200">Scheduled</em></>}
                        </h2>
                        <p className="text-white/50 mt-3 text-sm">
                          Next review set to: <strong className="text-amber-200 font-semibold">{new Date(gradingResult.srsItem.nextReviewDate).toLocaleDateString()}</strong> (Level {gradingResult.srsItem.currentLevel + 1})
                        </p>
                      </div>
                      <button
                        onClick={() => {
                          setActiveTab("dashboard");
                          setSelectedReview(null);
                          setGradingResult(null);
                        }}
                        className="btn-secondary px-6 py-3.5 text-sm font-semibold cursor-pointer shrink-0"
                      >
                        {language === "german" ? "Zurück zum Dashboard" : "Back to Dashboard"}
                      </button>
                    </div>

                    <div className="card-surface-elevated overflow-hidden">
                      <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-4 flex items-center gap-2.5">
                        <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                        <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">Remediation Brief</h3>
                      </div>

                      <div className="p-6 md:p-8">
                        <div className="whitespace-pre-wrap font-sans text-white/65 text-[15px] leading-relaxed">
                          {gradingResult.srsItem.lastFeedback}
                        </div>
                      </div>
                    </div>
                  </div>
                ) : (
                  /* Quiz taking UI */
                  <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
                    <div className="flex items-center justify-between mb-1">
                      <h3 className="font-display text-xl font-medium text-white flex items-center gap-2.5">
                        <AcademicCapIcon className="w-5 h-5 text-amber-300" />
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
                              className="card-surface-elevated p-5 md:p-8"
                            >
                              <div className="flex items-center gap-3 mb-5">
                                <span className="font-display text-2xl text-amber-300/50 italic leading-none">{String(idx + 1).padStart(2, "0")}</span>
                                <h3 className="text-xs font-bold text-amber-200/90 uppercase tracking-[0.16em]">{task.label}</h3>
                              </div>
                              <div className="text-[15px] text-white/75 whitespace-pre-wrap leading-relaxed mb-6">
                                {task.questionText}
                              </div>

                              <div className="border-t border-white/[0.06] pt-6">
                                <span className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Your Answer:</span>
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
                                  className="input-dark w-full px-5 py-4 text-sm leading-relaxed resize-none"
                                />
                              </div>
                            </motion.div>
                          );
                        })}

                        <div className="pt-4">
                          <motion.button
                            whileHover={{ scale: 1.01 }}
                            whileTap={{ scale: 0.98 }}
                            onClick={handleGrade}
                            disabled={!parsedTasks.some(task => (individualAnswers[task.id] || "").trim().length > 0)}
                            className="btn-primary w-full py-5 text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                          >
                            <SparklesIcon className="w-5 h-5" />
                            {language === "german" ? "ALLE ANTWORTEN ZUR KI-BEWERTUNG EINREICHEN" : "Submit All Answers for AI Grading"}
                          </motion.button>
                        </div>
                      </div>
                    ) : (
                      <div className="card-surface-elevated p-5 md:p-8 flex flex-col">
                        <div className="bg-black/25 border border-white/[0.06] rounded-2xl p-6 font-sans whitespace-pre-wrap text-white/60 text-sm leading-relaxed mb-6">
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

                        <span className="block text-[10px] font-bold text-white/30 uppercase tracking-[0.2em] mb-3">Your Answer:</span>
                        <textarea
                          value={studentAnswers}
                          onChange={e => setStudentAnswers(e.target.value)}
                          placeholder="Write your answers here..."
                          className="input-dark flex-1 w-full p-5 text-sm leading-relaxed resize-none min-h-[300px] mb-6"
                        />
                        <motion.button
                          whileHover={{ scale: 1.01 }}
                          whileTap={{ scale: 0.98 }}
                          onClick={handleGrade}
                          disabled={!studentAnswers.trim()}
                          className="btn-primary w-full py-5 text-xs font-bold uppercase tracking-[0.14em] flex items-center justify-center gap-2.5 cursor-pointer disabled:opacity-40"
                        >
                          <SparklesIcon className="w-5 h-5" />
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
              <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
                <motion.div
                  initial={{ scale: 0.95, opacity: 0 }}
                  animate={{ scale: 1, opacity: 1 }}
                  exit={{ scale: 0.95, opacity: 0 }}
                  className="card-glass w-full max-w-lg overflow-hidden flex flex-col max-h-[85vh] border border-white/[0.1]"
                >
                  <div className="p-6 border-b border-white/[0.06] flex justify-between items-center">
                    <h3 className="font-display text-xl font-medium text-white">Video Archive</h3>
                    <button
                      onClick={() => setArchiveModalData(null)}
                      className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                    >
                      <XMarkIcon className="w-4 h-4" />
                    </button>
                  </div>
                  <div className="p-6 space-y-3 overflow-y-auto custom-scrollbar">
                    {archiveModalData.map((item, idx) => (
                      <div key={idx} className="card-surface p-4 flex items-center justify-between">
                        <div>
                          <h4 className="text-white text-sm font-semibold">Level {item.level + 1} Video</h4>
                          {item.date && <p className="text-xs text-white/40 mt-0.5">{new Date(item.date).toLocaleDateString()}</p>}
                        </div>
                        <a
                          href={item.url}
                          target="_blank"
                          rel="noopener noreferrer"
                          className="btn-secondary px-4 py-2 text-xs flex items-center gap-2"
                        >
                          <VideoCameraIcon className="w-4 h-4 text-amber-300" />
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
            <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/75 backdrop-blur-md">
              <motion.div
                initial={{ scale: 0.95, opacity: 0 }}
                animate={{ scale: 1, opacity: 1 }}
                exit={{ scale: 0.95, opacity: 0 }}
                className="card-glass w-full max-w-4xl overflow-hidden flex flex-col max-h-[85vh] border border-white/[0.1]"
              >
                {/* Header */}
                <div className="p-6 border-b border-white/[0.06] flex justify-between items-center">
                  <div>
                    <h3 className="font-display text-xl font-medium text-white">{activeFeedbackItem.subjectSub}</h3>
                    <p className="text-xs text-white/40 mt-1">{activeFeedbackItem.subjectMain} — Level {activeFeedbackItem.currentLevel + 1}</p>
                  </div>
                  <button
                    onClick={() => setActiveFeedbackItem(null)}
                    className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                  >
                    <XMarkIcon className="w-4 h-4" />
                  </button>
                </div>

                {/* Header/Title */}
                <div className="border-b border-white/[0.06] bg-white/[0.02] px-6 py-3.5 flex items-center gap-2.5">
                  <DocumentTextIcon className="w-4 h-4 text-amber-300" />
                  <h3 className="text-xs font-bold uppercase tracking-[0.16em] text-white/60">{language === "german" ? "Feedback & Auswertung" : "Remediation Brief & Feedback"}</h3>
                </div>

                {/* Body */}
                <div className="flex-1 overflow-y-auto p-6 md:p-8 custom-scrollbar">
                  <div className="whitespace-pre-wrap font-sans text-white/60 text-sm leading-relaxed">
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
              className="fixed inset-0 bg-black/75 backdrop-blur-md z-50 flex items-center justify-center p-4"
              onClick={() => setShowCalendarModal(false)}
            >
              <motion.div
                initial={{ scale: 0.9, opacity: 0, y: 20 }}
                animate={{ scale: 1, opacity: 1, y: 0 }}
                exit={{ scale: 0.9, opacity: 0, y: 20 }}
                className="card-glass p-6 md:p-7 max-w-lg w-full border border-white/[0.1] max-h-[90vh] overflow-y-auto custom-scrollbar"
                onClick={(e) => e.stopPropagation()}
              >
                <div className="flex items-center justify-between mb-2">
                  <h2 className="font-display text-xl font-medium flex items-center gap-2.5 text-white">
                    <CalendarDaysIcon className="w-5 h-5 text-amber-300" />
                    Calendar Sync
                  </h2>
                  <button onClick={() => setShowCalendarModal(false)} className="text-white/40 hover:text-white p-2 transition-colors cursor-pointer">
                    <XMarkIcon className="w-5 h-5" />
                  </button>
                </div>

                <p className="text-sm text-white/45 mb-7 leading-relaxed">
                  Subscribe once — all future reviews will automatically appear in your calendar.
                </p>

                {/* Apple Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">🍎 Apple Calendar (Mac/iPhone)</h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar`}
                    className="btn-secondary flex items-center justify-center gap-2 w-full py-3.5 text-sm"
                  >
                    <CalendarDaysIcon className="w-4 h-4 text-amber-300" />
                    Subscribe in Apple Calendar
                  </a>
                  <p className="text-xs text-white/30 mt-2.5 ml-1 leading-relaxed">
                    <strong className="text-white/50">Hinweis für lokales Testen:</strong> Apple blockiert 1-Click Abos ohne HTTPS. Für ein Live-Abo füge <code className="bg-white/[0.06] px-1.5 py-0.5 rounded text-amber-200/70">http://localhost:3000/api/calendar</code> manuell in Apple Calendar ein. Im Live-Betrieb funktioniert der Button automatisch.
                  </p>
                </div>

                {/* Google Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">📅 Google Calendar</h3>
                  <div className="flex gap-2">
                    <input
                      readOnly
                      value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/calendar`}
                      className="input-dark flex-1 px-4 py-2.5 text-xs font-mono truncate"
                    />
                    <button
                      onClick={() => {
                        navigator.clipboard.writeText(`${window.location.origin}/api/calendar`);
                        setCalendarUrlCopied(true);
                        setTimeout(() => setCalendarUrlCopied(false), 2000);
                      }}
                      className="btn-secondary px-4 py-2.5 text-xs font-medium flex items-center gap-2 cursor-pointer shrink-0"
                    >
                      {calendarUrlCopied ? <CheckIcon className="w-4 h-4 text-emerald-300" /> : <DocumentDuplicateIcon className="w-4 h-4" />}
                      {calendarUrlCopied ? "Copied!" : "Copy"}
                    </button>
                  </div>
                  <p className="text-xs text-white/30 mt-2.5 ml-1 leading-relaxed">
                    Google Calendar → Other calendars (+) → From URL → Paste the URL above.
                  </p>
                </div>

                {/* Done Calendar */}
                <div className="mb-5">
                  <h3 className="text-xs font-bold uppercase tracking-[0.14em] mb-2.5 flex items-center gap-2 text-white/70">🟢 Done Calendar (Optional)</h3>
                  <a
                    href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar/done`}
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-400/[0.08] hover:bg-emerald-400/[0.16] rounded-xl text-xs font-medium text-emerald-300 transition-all border border-emerald-400/20"
                  >
                    <CalendarDaysIcon className="w-4 h-4" />
                    Subscribe to Log History
                  </a>
                  <p className="text-[10px] text-white/30 mt-2.5 ml-1 leading-relaxed">
                    Track your daily progress by subscribing to your completed reviews.
                  </p>
                </div>

                {/* One-time download fallback */}
                <div className="pt-5 border-t border-white/[0.06]">
                  <a
                    href="/api/calendar"
                    download="srs-reviews.ics"
                    className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/[0.03] hover:bg-white/[0.06] rounded-xl text-xs font-medium text-white/40 hover:text-white/65 transition-all border border-white/[0.06]"
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
            className="fixed inset-0 bg-black/80 flex items-center justify-center p-4 z-50 backdrop-blur-md"
          >
            <motion.div
              initial={{ scale: 0.95, opacity: 0 }}
              animate={{ scale: 1, opacity: 1 }}
              exit={{ scale: 0.95, opacity: 0 }}
              className="card-glass p-6 md:p-7 w-full max-w-lg border border-white/[0.1] max-h-[90vh] overflow-y-auto custom-scrollbar"
            >
              <div className="flex justify-between items-center mb-7">
                <h3 className="font-display text-xl font-medium text-white flex items-center gap-2.5">
                  <AcademicCapIcon className="w-5 h-5 text-amber-300" />
                  {language === "german" ? "Semester-Einstellungen" : "Semester Settings"}
                </h3>
                <button
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-white/[0.06] rounded-full transition-colors text-white/50 hover:text-white cursor-pointer"
                >
                  <XMarkIcon className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-7">
                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Aktueller Status" : "Current Status"}</h4>
                  <div className="card-surface p-4 flex items-center justify-between">
                    <div>
                      <div className="font-display text-2xl font-medium text-white">Semester <span className="text-gradient italic">{currentSemester}</span></div>
                      <div className="text-sm text-white/40 mt-0.5">{language === "german" ? "Aktiver Studienzeitraum" : "Active study period"}</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Modul-Voreinstellungen" : "Module Presets"}</h4>
                  <div className="space-y-2 mb-3">
                    {modulePresets.length === 0 ? (
                      <div className="text-white/30 text-sm italic py-2">No modules defined yet.</div>
                    ) : (
                      modulePresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between card-surface px-4 py-3">
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
                            className="text-white/30 hover:text-rose-300 transition-colors cursor-pointer"
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
                      className="input-dark flex-1 px-4 py-2.5 text-sm"
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
                      className="btn-secondary px-4 py-2.5 text-sm cursor-pointer"
                    >
                      {language === "german" ? "Hinzufügen" : "Add"}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.07]">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "Sprache" : "Language Setting"}</h4>
                  <div className="flex gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
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
                      className={`flex-1 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${language === 'german' ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
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
                      className={`flex-1 py-2.5 rounded-lg text-sm transition-colors cursor-pointer ${language === 'english' ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      English
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-white/[0.07]">
                  <h4 className="text-[10px] font-bold text-white/40 uppercase tracking-[0.2em] mb-3">{language === "german" ? "KI-Verbindung" : "AI Connection"}</h4>
                  <p className="text-xs text-white/40 mb-4 leading-relaxed">
                    {language === "german"
                      ? "Wähle aus, für welche Module der experimentelle Gemini Proxy genutzt werden soll. Die offizielle Google API dient immer als sicherer Fallback."
                      : "Choose which modules should use the experimental Gemini proxy. The official Google API will always act as a reliable fallback."}
                  </p>
                  {(isGenerating || isGrading) && (
                    <div className="mb-4 text-xs font-semibold text-amber-300 flex items-center gap-2">
                      <LockClosedIcon className="w-3.5 h-3.5" />
                      {language === "german" ? "Einstellungen gesperrt, während eine KI-Aktion läuft." : "Settings locked while AI generation is in progress."}
                    </div>
                  )}
                  <div className="flex gap-2 bg-white/[0.02] border border-white/[0.06] rounded-xl p-1">
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "all" })
                        }).then(res => res.json()).then(data => {
                          if (!data.error && data.wrapperMode) setWrapperMode(data.wrapperMode);
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "all" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Alles (Wrapper)" : "All (Proxy)"}
                    </button>
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "generation_only" })
                        }).then(res => res.json()).then(data => {
                          if (!data.error && data.wrapperMode) setWrapperMode(data.wrapperMode);
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "generation_only" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Nur Generierung" : "Gen Only"}
                    </button>
                    <button
                      disabled={isGenerating || isGrading}
                      onClick={() => {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'update_wrapper_toggle', wrapperMode: "none" })
                        }).then(res => res.json()).then(data => {
                          if (!data.error && data.wrapperMode) setWrapperMode(data.wrapperMode);
                        });
                      }}
                      className={`flex-1 py-2.5 rounded-lg text-xs sm:text-sm transition-colors cursor-pointer ${(isGenerating || isGrading) ? 'opacity-50 cursor-not-allowed' : ''} ${wrapperMode === "none" ? 'bg-amber-400/15 text-amber-100 border border-amber-400/30 font-medium' : 'border border-transparent text-white/45 hover:bg-white/[0.04] hover:text-white/70'}`}
                    >
                      {language === "german" ? "Nur Fallback" : "Fallback Only"}
                    </button>
                  </div>
                </div>

                <div className="pt-6 border-t border-rose-400/[0.12]">
                  <h4 className="text-[10px] font-bold text-rose-300 uppercase tracking-[0.2em] mb-2">{language === "german" ? "Gefahrenzone" : "Danger Zone"}</h4>
                  <p className="text-white/40 text-xs mb-4 leading-relaxed">{language === "german" ? "Der Start eines neuen Semesters erhöht den Semesterzähler und löscht deine aktuellen Modul-Voreinstellungen." : "Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh."}</p>
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
                    className="w-full py-3.5 bg-rose-500/[0.08] hover:bg-rose-500/[0.16] text-rose-300 border border-rose-400/20 hover:border-rose-400/35 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2 cursor-pointer"
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
                    className="w-full py-2.5 bg-transparent hover:bg-rose-500/[0.08] text-white/40 hover:text-rose-300 border border-transparent hover:border-rose-400/20 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2 cursor-pointer"
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
