"use client";

import { motion, AnimatePresence } from "framer-motion";
import { 
  BrainCircuit, 
  BookOpen, 
  CalendarDays, 
  ChevronRight,
  Sparkles,
  CheckCircle2,
  Clock,
  Loader2,
  FileText,
  Copy,
  Check,
  ArrowLeft,
  X,
  GraduationCap,
  ChevronDown,
  UploadCloud,
  AlertTriangle,
  Printer,
  Trash2
} from "lucide-react";
import { useState, useEffect, useCallback } from "react";
import { Bell, BellOff } from "lucide-react";

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

export default function Dashboard() {
  const [upcomingReviews, setUpcomingReviews] = useState<any[]>([]);
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
  const [showSettingsModal, setShowSettingsModal] = useState(false);
  const [newPresetInput, setNewPresetInput] = useState("");
  
  useEffect(() => {
    fetch('/api/settings')
      .then(res => res.json())
      .then(data => {
        if (!data.error) {
          setCurrentSemester(data.currentSemester);
          setModulePresets(data.modulePresets || []);
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

  const fetchReviews = useCallback(() => {
    fetch('/api/reviews')
      .then(res => res.json())
      .then(data => {
        if (Array.isArray(data)) {
          const formatted = data.map(item => {
            const dueDate = new Date(item.nextReviewDate);
            const isDue = dueDate <= new Date();
            return {
              id: item.id,
              subject: item.subjectMain,
              topic: item.subjectSub,
              level: item.currentLevel,
              dueDate: isDue ? "Due Now" : dueDate.toLocaleDateString(),
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

          setUpcomingReviews(formatted);
        }
      })
      .catch(console.error);
  }, []);

  useEffect(() => {
    if (activeTab === "dashboard") {
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
      review.raw.quiz5DocId
    ];
    const quizText = quizFields[level] || review.raw.quiz1DocId || "";
    
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
          studentAnswers: payloadAnswers
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
        <div className="hidden print:block p-8 w-full bg-white text-black">
          <div className="max-w-3xl mx-auto">
            <div className="border-b-2 border-zinc-200 pb-5 mb-8">
              <h1 className="text-2xl font-bold font-sans text-zinc-900 mb-1">{selectedReview.topic}</h1>
              <p className="text-xs text-zinc-500 font-medium">
                <span className="bg-zinc-900 text-zinc-300 px-2 py-0.5 rounded mr-2 font-bold uppercase tracking-wider">Level {selectedReview.level}</span>
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
                      <p className="text-[10px] font-bold text-zinc-400 uppercase tracking-wider mb-1">Antwort:</p>
                      {Array.from({ length: lineCount }).map((_, i) => (
                        <div key={i} className="border-b border-zinc-300 h-7 w-full"></div>
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
      <div className="flex w-full print:hidden">

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-64 sidebar-gradient border-r border-white/[0.06] flex flex-col p-6 sticky top-0 h-screen"
      >
        <div className="flex items-center gap-3 mb-12">
          <div className="w-10 h-10 rounded-xl bg-gradient-to-br from-zinc-9000 to-violet-600 flex items-center justify-center shadow-lg shadow-white/[0.12]">
            <BrainCircuit className="text-white w-5 h-5" />
          </div>
          <div className="flex flex-col">
            <h1 className="text-xl font-bold tracking-tight">SRS<span className="text-gradient">Master</span></h1>
            <div className="mt-1 text-[10px] font-bold text-accent-1 bg-accent-1/10 px-2 py-0.5 rounded-full border border-accent-1/20 self-start">
              Semester {currentSemester}
            </div>
          </div>
        </div>

        <nav className="flex flex-col gap-2">
          <button onClick={() => setActiveTab("dashboard")} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'dashboard' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <CalendarDays className="w-5 h-5" />
            <span className="font-medium">Dashboard</span>
          </button>
          <button onClick={() => setActiveTab("upload")} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'upload' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <UploadCloud className="w-5 h-5" />
            <span className="font-medium">Upload Material</span>
          </button>
          <button onClick={() => setActiveTab("library")} className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${activeTab === 'library' ? 'nav-item-active' : 'nav-item-idle'}`}>
            <BookOpen className="w-5 h-5" />
            <span className="font-medium">Library</span>
          </button>
        </nav>

        <div className="mt-auto flex flex-col gap-3">
          {/* Push Notification Toggle */}
          <button
            onClick={subscribeToPush}
            className={`flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200 ${
              pushPermission === "granted" && pushSubscribed
                ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                : "nav-item-idle"
            }`}
          >
            {pushPermission === "granted" && pushSubscribed ? (
              <Bell className="w-5 h-5" />
            ) : (
              <BellOff className="w-5 h-5" />
            )}
            <span className="font-medium text-sm">
              {pushPermission === "granted" && pushSubscribed
                ? "Notifications On"
                : pushPermission === "denied"
                ? "Notifications Blocked"
                : "Enable Notifications"}
            </span>
          </button>

          <div className="card-surface p-4 relative overflow-hidden">
            <div className="absolute -top-10 -right-10 w-24 h-24 hidden"></div>
            <Sparkles className="w-6 h-6 text-amber-400 mb-2" />
            <h3 className="font-medium text-white/90 text-sm mb-1">Live Tutor Pro</h3>
            <p className="text-xs text-white/40 mb-3">Upgrade your learning with voice AI.</p>
            <button className="w-full py-2 bg-white/[0.04] hover:bg-white/[0.06] rounded-lg text-xs font-medium border border-white/[0.08] text-white/30 cursor-not-allowed transition-colors">
              Unlock (Phase 2)
            </button>
          </div>
        </div>
      </motion.aside>

      {/* Main Content */}
      <main className="flex-1 p-10 overflow-y-auto relative h-screen">
        <AnimatePresence mode="wait">
          {activeTab === "dashboard" && (
            <motion.div 
              key="dash"
              initial={{ opacity: 0, y: 10 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -10 }}
              className="max-w-5xl mx-auto"
            >
              <header className="mb-12 flex justify-between items-end">
                <div>
                  <h2 className="text-sm font-medium text-white mb-1 uppercase tracking-wider">Welcome back</h2>
                  <h1 className="text-4xl font-bold tracking-tight text-white mb-2">Ready to level up?</h1>
                  <p className="text-white/50">You have {upcomingReviews.filter(r => r.isDue).length} reviews due today.</p>
                </div>
              </header>

              <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                {/* Reviews List */}
                <div className="lg:col-span-2 flex flex-col gap-4">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-semibold flex items-center gap-2">
                      <Clock className="w-5 h-5 text-white" />
                      Upcoming Reviews
                    </h3>
                    <button
                      onClick={() => setShowCalendarModal(true)}
                      className="flex items-center gap-2 px-3 py-1.5 text-xs font-medium rounded-lg bg-white/[0.04] hover:bg-white/[0.08] border border-white/[0.12] text-white hover:text-indigo-300 transition-all"
                    >
                      <CalendarDays className="w-3.5 h-3.5" />
                      Sync to Calendar
                    </button>
                  </div>

                  {upcomingReviews.length === 0 ? (
                    <div className="card-surface p-10 text-center text-white/40">
                      No reviews found. Upload lecture material to generate your first quiz!
                    </div>
                  ) : (
                    upcomingReviews.map((review, i) => (
                      <motion.div 
                        key={review.id} 
                        onClick={() => startQuiz(review)}
                        className={`card-surface-elevated p-5 transition-all duration-300 group cursor-pointer hover:border-white/[0.2] relative overflow-hidden ${review.isDue ? 'border-white/[0.12] glow-primary' : ''}`}
                      >
                        <div className="accent-bar"></div>
                        <div className="flex justify-between items-center pl-2">
                          <div className="flex-1">
                            <div className="flex items-center gap-3 mb-1">
                              <span className={`text-xs font-semibold px-2.5 py-1 rounded-md ${review.isDue ? 'badge-due' : 'badge-level'}`}>Level {review.level}</span>
                              <span className="text-[10px] font-bold text-white/50 bg-white/[0.04] px-2 py-0.5 rounded-full border border-white/[0.08]">
                                Sem {review.semester}
                              </span>
                              <span className="text-xs text-white/40">{review.isDue ? "Due Now" : `Scheduled: ${review.dueDate}`}</span>
                            </div>
                            <h4 className="text-lg font-medium text-white">{review.subject}</h4>
                            <p className="text-sm text-white/40">{review.topic}</p>

                            {review.raw.lastFeedback && (
                              <button 
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setActiveFeedbackItem(review.raw);
                                  setFeedbackTab("brief");
                                }}
                                className="mt-3 text-xs bg-white/[0.04] hover:bg-white/[0.06] border border-white/[0.08] text-white/50 px-3 py-1.5 rounded-lg flex items-center gap-1.5 transition-all cursor-pointer"
                              >
                                <FileText className="w-3.5 h-3.5 text-white" />
                                View Last Feedback & Video Prompts
                              </button>
                            )}

                            <div className="flex gap-2 w-full mt-4" onClick={(e) => e.stopPropagation()}>
                              {/* PRE-PODCAST */}
                              <div className="flex-1">
                                <h5 className="text-[10px] font-bold text-stone-500 uppercase mb-1">Pre-Lecture Teaser</h5>
                                {review.raw.prePodcastUrl && review.raw.prePodcastUrl.startsWith("http") ? (
                                  <a 
                                    href={review.raw.prePodcastUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-2 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all w-full font-medium"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Notebook öffnen
                                  </a>
                                ) : (
                                  <div className="text-xs bg-amber-50 border border-amber-200 text-amber-600 px-2 py-1.5 rounded-md flex items-center gap-1.5 w-full justify-center">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Wird konfiguriert...
                                  </div>
                                )}
                              </div>

                              {/* POST-PODCAST */}
                              <div className="flex-1">
                                <h5 className="text-[10px] font-bold text-stone-500 uppercase mb-1">Post-Lecture Deep Dive</h5>
                                {review.raw.postPodcastUrl && review.raw.postPodcastUrl.startsWith("http") ? (
                                  <a 
                                    href={review.raw.postPodcastUrl} 
                                    target="_blank" 
                                    rel="noopener noreferrer" 
                                    className="text-xs bg-indigo-50 hover:bg-indigo-100 border border-indigo-200 text-indigo-700 px-2 py-1.5 rounded-md flex items-center justify-center gap-1.5 transition-all w-full font-medium"
                                  >
                                    <Sparkles className="w-3 h-3" />
                                    Notebook öffnen
                                  </a>
                                ) : (
                                  <div className="text-xs bg-amber-50 border border-amber-200 text-amber-600 px-2 py-1.5 rounded-md flex items-center gap-1.5 w-full justify-center">
                                    <Loader2 className="w-3 h-3 animate-spin" />
                                    Wird konfiguriert...
                                  </div>
                                )}
                              </div>
                            </div>
                          </div>
                          <div className="flex flex-col items-center gap-2">
                            <button className="w-12 h-12 rounded-full flex items-center justify-center transition-all bg-white/[0.04] text-white/40 group-hover:bg-white/[0.08] group-hover:text-white group-hover:scale-110 cursor-pointer">
                              <ChevronRight className="w-6 h-6 ml-1" />
                            </button>
                            <button 
                              onClick={(e) => handleDeleteModule(e, review.id)}
                              className="w-10 h-10 rounded-full flex items-center justify-center transition-all bg-white/[0.04] text-white/40 hover:bg-red-500/20 hover:text-red-400 cursor-pointer"
                              title="Delete Module"
                            >
                              <Trash2 className="w-4 h-4" />
                            </button>
                          </div>
                        </div>
                      </motion.div>
                    ))
                  )}
                </div>

                {/* Quick Actions */}
                <div className="flex flex-col gap-6">
                  <motion.div className="card-surface-elevated p-6 gradient-border cursor-pointer transition-colors" onClick={() => setActiveTab("upload")}>
                    <h3 className="text-lg font-semibold mb-2 text-white">Upload Material</h3>
                    <p className="text-sm text-white/40 mb-4">Feed the engine a new module to start the 6-stage generative AI pipeline.</p>
                    <button className="btn-primary w-full py-3 px-4 flex items-center justify-center gap-2 cursor-pointer">
                      <UploadCloud className="w-5 h-5" />
                      Upload Now
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
                <p className="text-white/50">Paste your lecture material below to run the full 6-stage Didactic AI chain.</p>
              </header>

              {isGenerating ? (
                <div className="card-surface-elevated p-10 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-12 h-12 text-white animate-spin mb-6" />
                  <h3 className="text-2xl font-bold text-white mb-2">Processing Module...</h3>
                  <p className="text-white/50 mb-8 text-lg">{progressMsg}</p>
                  
                  <div className="progress-track w-full max-w-md h-3">
                    <motion.div 
                      className="progress-fill h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${(progressStep / 8) * 100}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="w-full max-w-md mt-4 text-left space-y-3">
                     {[1,2,3,4,5,6,7].map(step => (
                        <div key={step} className={`flex items-center gap-3 text-sm ${progressStep > step ? 'text-emerald-400' : progressStep === step ? 'text-white font-medium' : 'text-white/20'}`}>
                           {progressStep > step ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                           {step === 1 ? "Blueprint Engine" : step === 7 ? "Tutor Prompt Engine" : `Quiz Agent (Level ${step-1})`}
                        </div>
                     ))}
                  </div>
                </div>
              ) : (
                <div className="card-surface-elevated p-8 flex flex-col gap-6">
                  <div className="flex gap-4">
                    <div className="flex-1">
                      <div className="flex items-center justify-between mb-2">
                        <label className="text-sm font-medium text-white/50">Module (Semester {currentSemester})</label>
                        <button onClick={() => setShowSettingsModal(true)} className="text-xs text-accent-1 hover:text-white transition-colors">Manage Presets</button>
                      </div>
                      {modulePresets.length > 0 ? (
                        <select 
                          value={subjectInput}
                          onChange={e => setSubjectInput(e.target.value)}
                          className="input-dark w-full px-4 py-3 appearance-none bg-zinc-900"
                        >
                          {modulePresets.map(preset => (
                            <option key={preset} value={preset}>{preset}</option>
                          ))}
                        </select>
                      ) : (
                        <div className="input-dark w-full px-4 py-3 text-white/50 text-sm flex items-center justify-between">
                          No modules defined for Semester {currentSemester}
                          <button onClick={() => setShowSettingsModal(true)} className="text-accent-1 hover:text-white font-medium">Add Presets</button>
                        </div>
                      )}
                    </div>
                    <div className="flex-1">
                      <label className="block text-sm font-medium text-white/50 mb-2">Topic / Thema</label>
                      <input 
                        type="text" 
                        value={topicInput}
                        onChange={e => setTopicInput(e.target.value)}
                        placeholder="e.g. Memory & Motivation"
                        className="input-dark w-full px-4 py-3"
                      />
                    </div>
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-white/50 mb-2">Lecture Material (Files or Text)</label>
                    <div 
                      className={`w-full border-2 border-dashed rounded-xl p-8 mb-4 flex flex-col items-center justify-center transition-colors ${isDragging ? 'border-zinc-9000 bg-white/[0.04]' : 'border-white/[0.08] bg-white/[0.02]'}`}
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
                      <UploadCloud className="w-8 h-8 text-white/30 mb-3" />
                      <p className="text-white/40 text-sm text-center mb-4">
                        Drag and drop your PDFs, Excel, or Word files here
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
                        Browse Files
                      </label>
                    </div>

                    {uploadedFiles.length > 0 && (
                      <div className="flex flex-wrap gap-2 mb-4">
                        {uploadedFiles.map((file, idx) => (
                          <div key={idx} className="flex items-center gap-2 bg-white/[0.08] text-indigo-300 px-3 py-1.5 rounded-lg text-xs font-medium border border-white/[0.12]">
                            <FileText className="w-3.5 h-3.5" />
                            {file.name}
                            <button onClick={() => setUploadedFiles(prev => prev.filter((_, i) => i !== idx))} className="ml-1 hover:text-white cursor-pointer">
                              <X className="w-3.5 h-3.5" />
                            </button>
                          </div>
                        ))}
                      </div>
                    )}

                    <textarea 
                      value={textInput}
                      onChange={e => setTextInput(e.target.value)}
                      placeholder="...or paste your lecture notes, transcript, or raw text here..."
                      className="input-dark w-full px-4 py-3 h-32 resize-none"
                    />
                  </div>
                  <button 
                    onClick={handleGenerate}
                    disabled={(!textInput && uploadedFiles.length === 0) || !subjectInput}
                    className="btn-primary w-full py-4 flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                  >
                    <BrainCircuit className="w-5 h-5" />
                    Start 6-Stage AI Generation
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
              <header className="mb-12">
                <h1 className="text-4xl font-bold tracking-tight text-white mb-2">My Library</h1>
                <p className="text-white/50">Review your stored modules, tutor prompts, and generating schedules.</p>
              </header>
              <div className="card-surface p-10 text-center text-white/40">
                All generated courses and details will reflect here as we build custom features!
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
                <ArrowLeft className="w-4 h-4" />
                Back to Dashboard
              </button>

              <header className="mb-8">
                <div className="flex items-center gap-3 mb-2">
                  <span className="text-xs font-semibold px-2.5 py-1 rounded-md badge-level">Level {selectedReview.level}</span>
                  <span className="text-xs text-white/40">Active Quiz</span>
                </div>
                <div className="flex items-center justify-between">
                  <div>
                    <h1 className="text-2xl font-bold tracking-tight text-white">{selectedReview.subject}</h1>
                    <p className="text-xs text-white/40 mt-1 font-medium">{selectedReview.topic}</p>
                  </div>
                  {parsedTasks.length > 0 && (
                    <motion.button
                      whileHover={{ scale: 1.04 }}
                      whileTap={{ scale: 0.96 }}
                      onClick={exportQuizForPrint}
                      className="flex items-center gap-2 px-4 py-2.5 btn-secondary text-xs font-bold rounded-xl cursor-pointer"
                    >
                      <Printer className="w-4 h-4" />
                      Exportieren
                    </motion.button>
                  )}
                </div>
              </header>

              {gradingError && !isGrading && (
                <div className="mb-6 p-5 rounded-xl bg-red-500/10 border border-red-500/20 text-red-300 text-sm flex flex-col gap-2">
                  <div className="flex items-center gap-2 text-red-400 font-semibold">
                    <AlertTriangle className="w-5 h-5" />
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
                <div className="card-surface-elevated p-10 flex flex-col items-center justify-center text-center">
                  <Loader2 className="w-12 h-12 text-white animate-spin mb-6" />
                  <h3 className="text-2xl font-bold mb-2 text-white">Grading Submission...</h3>
                  <p className="text-white/50 mb-8 text-lg">{gradingMsg}</p>
                  
                  <div className="progress-track w-full max-w-md h-3">
                    <motion.div 
                      className="progress-fill h-full"
                      initial={{ width: 0 }}
                      animate={{ width: `${Math.min(100, (gradingStep / 4) * 100)}%` }}
                      transition={{ duration: 0.5 }}
                    />
                  </div>
                  <div className="w-full max-w-md mt-4 text-left space-y-3">
                     {[1,2,3,4].map(step => (
                        <div key={step} className={`flex items-center gap-3 text-sm ${gradingStep > step ? 'text-emerald-400' : gradingStep === step ? 'text-white font-medium' : 'text-white/20'}`}>
                           {gradingStep > step ? <CheckCircle2 className="w-4 h-4" /> : <div className="w-4 h-4 rounded-full border-2 border-current" />}
                           {step === 1 ? "Co-Prüfer 1 & 2 (Parallel Evaluation)" : 
                            step === 2 ? "Chef-Prüfer (Consolidation & Brief)" : 
                            step === 3 ? "Follow-Up Generation (Quiz & Video)" : "Saving Database Records"}
                        </div>
                     ))}
                  </div>
                </div>
              ) : gradingResult ? (
                <div className="space-y-6">
                  <div className={`card-surface-elevated p-8 flex flex-col sm:flex-row items-start sm:items-center justify-between gap-6 ${gradingResult.isPass ? 'border-emerald-500/20 glow-success' : 'border-red-500/20 glow-danger'}`}>
                    <div>
                      <span className={`text-xs font-bold uppercase tracking-wider px-3 py-1 rounded-full ${gradingResult.isPass ? 'bg-emerald-500/15 text-emerald-400 border border-emerald-500/20' : 'bg-red-500/15 text-red-400 border border-red-500/20'}`}>
                        {gradingResult.isPass ? "PASS (Bestanden)" : "REPEAT (Wiederholen)"}
                      </span>
                      <h2 className="text-3xl font-extrabold text-white mt-3">
                        {gradingResult.isPass ? "Level Promoted!" : "Remediation Scheduled"}
                      </h2>
                      <p className="text-white/50 mt-1 text-sm">
                        Next review set to: <strong className="text-white">{new Date(gradingResult.srsItem.nextReviewDate).toLocaleDateString()}</strong> (Level {gradingResult.srsItem.currentLevel})
                      </p>
                    </div>
                    <button 
                      onClick={() => {
                        setActiveTab("dashboard");
                        setSelectedReview(null);
                        setGradingResult(null);
                      }}
                      className="btn-secondary px-6 py-3 font-semibold rounded-xl cursor-pointer"
                    >
                      Back to Dashboard
                    </button>
                  </div>

                  <div className="card-surface-elevated overflow-hidden">
                    <div className="flex border-b border-white/[0.06] bg-white/[0.02]">
                      <button 
                        onClick={() => setResultTab("brief")} 
                        className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${resultTab === 'brief' ? 'border-zinc-9000 text-white bg-zinc-9000/5' : 'border-transparent text-white/40 hover:text-white/60'}`}
                      >
                        Remediation Brief
                      </button>
                      <button 
                        onClick={() => setResultTab("prompts")} 
                        className={`flex-1 sm:flex-none px-6 py-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${resultTab === 'prompts' ? 'border-zinc-9000 text-white bg-zinc-9000/5' : 'border-transparent text-white/40 hover:text-white/60'}`}
                      >
                        NotebookLM Video Prompts
                      </button>
                    </div>

                    <div className="p-8">
                      {resultTab === "brief" && (
                        <div className="whitespace-pre-wrap font-sans text-white/60 text-base leading-relaxed">
                          {gradingResult.srsItem.lastFeedback}
                        </div>
                      )}

                      {resultTab === "prompts" && (
                        <div className="space-y-8">
                          <div className="p-5 card-surface rounded-xl relative group">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="font-semibold text-white">Video Prompt 1 (Episode 1 - Polishing)</h3>
                              <button 
                                onClick={() => copyToClipboard(gradingResult.srsItem.lastVideoPrompt1, 'v1')}
                                className="btn-secondary text-xs px-3 py-1.5 cursor-pointer flex items-center gap-1.5"
                              >
                                {copiedId === 'v1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === 'v1' ? 'Copied!' : 'Copy Prompt'}
                              </button>
                            </div>
                            <pre className="text-xs text-white/40 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] leading-relaxed">
                              {gradingResult.srsItem.lastVideoPrompt1}
                            </pre>
                          </div>

                          <div className="p-5 card-surface rounded-xl relative group">
                            <div className="flex justify-between items-center mb-4">
                              <h3 className="font-semibold text-white">Video Prompt 2 (Episode 2 - Synthesis)</h3>
                              <button 
                                onClick={() => copyToClipboard(gradingResult.srsItem.lastVideoPrompt2, 'v2')}
                                className="btn-secondary text-xs px-3 py-1.5 cursor-pointer flex items-center gap-1.5"
                              >
                                {copiedId === 'v2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                                {copiedId === 'v2' ? 'Copied!' : 'Copy Prompt'}
                              </button>
                            </div>
                            <pre className="text-xs text-white/40 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] leading-relaxed">
                              {gradingResult.srsItem.lastVideoPrompt2}
                            </pre>
                          </div>
                        </div>
                      )}
                    </div>
                  </div>
                </div>
              ) : (
                /* Quiz taking UI */
                <div className="max-w-4xl mx-auto flex flex-col gap-6 pb-20">
                  <div className="flex items-center justify-between mb-2">
                    <h3 className="text-xl font-bold text-white flex items-center gap-2">
                      <GraduationCap className="w-6 h-6 text-white" />
                      Quiz Assignment
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
                            className="card-surface-elevated p-8 rounded-3xl"
                          >
                            <h3 className="text-sm font-bold text-white uppercase tracking-wider mb-3">{task.label}</h3>
                            <div className="text-sm text-white/70 whitespace-pre-wrap leading-relaxed mb-6 font-medium">
                              {task.questionText}
                            </div>
                            
                            <div className="border-t border-white/[0.06] pt-5">
                              <span className="block text-xs font-bold text-white/30 uppercase tracking-wider mb-3">Your Answer:</span>
                              <textarea
                                value={individualAnswers[task.id] || ""}
                                onChange={e => {
                                  setIndividualAnswers(prev => ({
                                    ...prev,
                                    [task.id]: e.target.value
                                  }));
                                }}
                                placeholder={isMC ? "Type A, B, C, or D..." : "Type your answer here..."}
                                rows={isMC ? 2 : 4}
                                className="input-dark w-full px-5 py-4 text-sm resize-none"
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
                          className="btn-primary w-full py-5 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                        >
                          <Sparkles className="w-5 h-5" />
                          Submit All Answers for AI Grading
                        </motion.button>
                      </div>
                    </div>
                  ) : (
                    <div className="card-surface-elevated p-8 rounded-3xl flex flex-col">
                      <div className="bg-white/[0.02] border border-white/[0.06] rounded-xl p-6 font-sans whitespace-pre-wrap text-white/50 text-sm leading-relaxed mb-6">
                        {(() => {
                          const level = selectedReview.level;
                          const quizFields = [
                            selectedReview.raw.quiz1DocId,
                            selectedReview.raw.quiz2DocId,
                            selectedReview.raw.quiz3DocId,
                            selectedReview.raw.quiz4DocId,
                            selectedReview.raw.quiz5DocId
                          ];
                          const rawQuiz = quizFields[level] || selectedReview.raw.quiz1DocId || "";
                          return extractStudentQuiz(rawQuiz);
                        })()}
                      </div>
                      
                      <span className="block text-xs font-bold text-white/30 uppercase tracking-wider mb-3">Your Answer:</span>
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
                        className="btn-primary w-full py-5 text-sm font-bold uppercase tracking-wider flex items-center justify-center gap-2 cursor-pointer disabled:opacity-40"
                      >
                        <Sparkles className="w-5 h-5" />
                        Submit Answer for AI Grading
                      </motion.button>
                    </div>
                  )}
                </div>
              )}
            </motion.div>
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
                  <p className="text-xs text-white/40">{activeFeedbackItem.subjectMain} — Level {activeFeedbackItem.currentLevel}</p>
                </div>
                <button 
                  onClick={() => setActiveFeedbackItem(null)}
                  className="w-8 h-8 rounded-full bg-white/[0.06] hover:bg-white/[0.1] flex items-center justify-center text-white/40 hover:text-white transition-colors cursor-pointer"
                >
                  <X className="w-4 h-4" />
                </button>
              </div>

              {/* Tabs */}
              <div className="flex border-b border-white/[0.06] bg-white/[0.02]">
                <button 
                  onClick={() => setFeedbackTab("brief")} 
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${feedbackTab === 'brief' ? 'border-zinc-9000 text-white bg-zinc-9000/5' : 'border-transparent text-white/40 hover:text-white/60'}`}
                >
                  Remediation Brief & Feedback
                </button>
                <button 
                  onClick={() => setFeedbackTab("prompts")} 
                  className={`px-6 py-4 text-sm font-medium border-b-2 transition-all cursor-pointer ${feedbackTab === 'prompts' ? 'border-zinc-9000 text-white bg-zinc-9000/5' : 'border-transparent text-white/40 hover:text-white/60'}`}
                >
                  NotebookLM Prompts
                </button>
              </div>

              {/* Body */}
              <div className="flex-1 overflow-y-auto p-6 space-y-6 custom-scrollbar">
                {feedbackTab === "brief" && (
                  <div className="whitespace-pre-wrap font-sans text-white/55 text-sm leading-relaxed">
                    {activeFeedbackItem.lastFeedback}
                  </div>
                )}

                {feedbackTab === "prompts" && (
                  <div className="space-y-6">
                    <div className="p-5 card-surface rounded-xl relative group">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-white">Video Prompt 1 (Episode 1 - Polishing)</h4>
                        <button 
                          onClick={() => copyToClipboard(activeFeedbackItem.lastVideoPrompt1, 'fv1')}
                          className="flex items-center gap-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-white/50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-white/[0.06]"
                        >
                          {copiedId === 'fv1' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === 'fv1' ? 'Copied!' : 'Copy Prompt'}
                        </button>
                      </div>
                      <pre className="text-xs text-white/40 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] leading-relaxed">
                        {activeFeedbackItem.lastVideoPrompt1}
                      </pre>
                    </div>

                    <div className="p-5 card-surface rounded-xl relative group">
                      <div className="flex justify-between items-center mb-4">
                        <h4 className="font-semibold text-white">Video Prompt 2 (Episode 2 - Synthesis)</h4>
                        <button 
                          onClick={() => copyToClipboard(activeFeedbackItem.lastVideoPrompt2, 'fv2')}
                          className="flex items-center gap-1.5 text-xs bg-white/[0.04] hover:bg-white/[0.08] text-white/50 px-3 py-1.5 rounded-lg transition-colors cursor-pointer border border-white/[0.06]"
                        >
                          {copiedId === 'fv2' ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                          {copiedId === 'fv2' ? 'Copied!' : 'Copy Prompt'}
                        </button>
                      </div>
                      <pre className="text-xs text-white/40 whitespace-pre-wrap font-mono max-h-60 overflow-y-auto bg-white/[0.02] p-4 rounded-xl border border-white/[0.06] leading-relaxed">
                        {activeFeedbackItem.lastVideoPrompt2}
                      </pre>
                    </div>
                  </div>
                )}
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
                  <CalendarDays className="w-5 h-5 text-white" />
                  Calendar Sync
                </h2>
                <button onClick={() => setShowCalendarModal(false)} className="text-white/40 hover:text-white p-1 transition-colors cursor-pointer">
                  <X className="w-5 h-5" />
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
                  className="flex items-center justify-center gap-2 w-full py-3 bg-white/[0.04] hover:bg-white/[0.08] rounded-xl text-sm font-medium text-white transition-all border border-white/[0.12]"
                >
                  <CalendarDays className="w-4 h-4" />
                  Subscribe in Apple Calendar
                </a>
                <p className="text-xs text-white/30 mt-1.5 ml-1">
                  <strong className="text-white/50">Hinweis für lokales Testen:</strong> Apple blockiert 1-Click Abos ohne HTTPS. Für ein Live-Abo füge <code className="bg-white/[0.06] px-1 py-0.5 rounded text-white/40">http://localhost:3000/api/calendar</code> manuell in Apple Calendar ein. Im Live-Betrieb funktioniert der Button automatisch.
                </p>
              </div>

              {/* Google Calendar */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-white">📅 Google Calendar</h3>
                <div className="flex gap-2">
                  <input
                    readOnly
                    value={`${typeof window !== 'undefined' ? window.location.origin : 'http://localhost:3000'}/api/calendar`}
                    className="input-dark flex-1 px-3 py-2.5 text-xs font-mono truncate"
                  />
                  <button
                    onClick={() => {
                      navigator.clipboard.writeText(`${window.location.origin}/api/calendar`);
                      setCalendarUrlCopied(true);
                      setTimeout(() => setCalendarUrlCopied(false), 2000);
                    }}
                    className="px-3 py-2.5 btn-secondary rounded-xl text-xs font-medium flex items-center gap-1.5"
                  >
                    {calendarUrlCopied ? <Check className="w-3.5 h-3.5 text-emerald-400" /> : <Copy className="w-3.5 h-3.5" />}
                    {calendarUrlCopied ? "Copied!" : "Copy"}
                  </button>
                </div>
                <p className="text-xs text-white/30 mt-1.5 ml-1">
                  Google Calendar → Other calendars (+) → From URL → Paste the URL above.
                </p>
              </div>

              {/* Done Calendar */}
              <div className="mb-4">
                <h3 className="text-sm font-semibold mb-2 flex items-center gap-2 text-white">🟢 Done Calendar (Optional)</h3>
                <a
                  href={`webcal://${typeof window !== 'undefined' ? window.location.host : 'localhost:3000'}/api/calendar/done`}
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-emerald-500/10 hover:bg-emerald-500/20 rounded-xl text-xs font-medium text-emerald-400 transition-all border border-emerald-500/20"
                >
                  <CalendarDays className="w-3.5 h-3.5" />
                  Subscribe to Log History
                </a>
                <p className="text-[10px] text-white/30 mt-1.5 ml-1">
                  Track your daily progress by subscribing to your completed reviews.
                </p>
              </div>

              {/* One-time download fallback */}
              <div className="pt-4 border-t border-white/[0.06]">
                <a
                  href="/api/calendar"
                  download="srs-reviews.ics"
                  className="flex items-center justify-center gap-2 w-full py-2.5 bg-white/[0.04] hover:bg-white/[0.06] rounded-xl text-xs font-medium text-white/40 hover:text-white/60 transition-all border border-white/[0.06]"
                >
                  <FileText className="w-3.5 h-3.5" />
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
                  <GraduationCap className="w-5 h-5 text-accent-1" />
                  Semester Settings
                </h3>
                <button 
                  onClick={() => setShowSettingsModal(false)}
                  className="p-2 hover:bg-white/[0.06] rounded-full transition-colors text-white/50"
                >
                  <X className="w-5 h-5" />
                </button>
              </div>

              <div className="space-y-6">
                <div>
                  <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Current Status</h4>
                  <div className="bg-white/[0.02] border border-white/[0.04] rounded-xl p-4 flex items-center justify-between">
                    <div>
                      <div className="text-2xl font-bold text-white">Semester {currentSemester}</div>
                      <div className="text-sm text-white/40">Active study period</div>
                    </div>
                  </div>
                </div>

                <div>
                  <h4 className="text-sm font-semibold text-white/50 uppercase tracking-wider mb-3">Module Presets</h4>
                  <div className="space-y-2 mb-3">
                    {modulePresets.length === 0 ? (
                      <div className="text-white/30 text-sm italic py-2">No modules defined yet.</div>
                    ) : (
                      modulePresets.map((preset, idx) => (
                        <div key={idx} className="flex items-center justify-between bg-white/[0.02] border border-white/[0.04] p-3 rounded-lg">
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
                            <X className="w-4 h-4" />
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
                            setModulePresets(data.modulePresets);
                            if (!subjectInput) setSubjectInput(newPresetInput.trim());
                            setNewPresetInput("");
                          });
                        }
                      }}
                      placeholder="e.g. Linear Algebra"
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
                            setModulePresets(data.modulePresets);
                            if (!subjectInput) setSubjectInput(newPresetInput.trim());
                            setNewPresetInput("");
                          });
                        }
                      }}
                      className="bg-white/[0.06] hover:bg-white/[0.1] text-white px-4 py-2 rounded-lg text-sm transition-colors border border-white/[0.08]"
                    >
                      Add
                    </button>
                  </div>
                </div>

                <div className="pt-4 mt-6 border-t border-white/[0.08]">
                  <h4 className="text-sm font-semibold text-red-400 uppercase tracking-wider mb-2">Danger Zone</h4>
                  <p className="text-white/40 text-xs mb-4">Starting a new semester will increment your semester counter and wipe your current module presets so you can start fresh.</p>
                  <button 
                    onClick={() => {
                      if (confirm("Are you sure you want to start a new semester? Your presets will be reset.")) {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'new_semester' })
                        }).then(res => res.json()).then(data => {
                          setCurrentSemester(data.currentSemester);
                          setModulePresets(data.modulePresets);
                          setSubjectInput("");
                        });
                      }
                    }}
                    className="w-full py-3 bg-red-500/10 hover:bg-red-500/20 text-red-400 border border-red-500/20 rounded-xl text-sm font-medium transition-colors flex items-center justify-center gap-2 mb-2"
                  >
                    <AlertTriangle className="w-4 h-4" />
                    Start New Semester (Semester {currentSemester + 1})
                  </button>
                  <button 
                    onClick={() => {
                      if (confirm("Are you absolutely sure you want to reset back to Semester 1? Your presets will be wiped.")) {
                        fetch('/api/settings', {
                          method: 'POST',
                          headers: { 'Content-Type': 'application/json' },
                          body: JSON.stringify({ action: 'reset_semester' })
                        }).then(res => res.json()).then(data => {
                          setCurrentSemester(data.currentSemester);
                          setModulePresets(data.modulePresets);
                          setSubjectInput("");
                        });
                      }
                    }}
                    className="w-full py-2 bg-transparent hover:bg-red-500/10 text-white/40 hover:text-red-400 border border-transparent hover:border-red-500/20 rounded-xl text-xs font-medium transition-colors flex items-center justify-center gap-2"
                  >
                    Reset to Semester 1
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
