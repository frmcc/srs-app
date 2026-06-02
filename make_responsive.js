const fs = require('fs');
let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Add Menu import
content = content.replace('X,\n  GraduationCap', 'X,\n  Menu,\n  GraduationCap');

// 2. Add State
content = content.replace('const [showSettingsModal, setShowSettingsModal] = useState(false);', 'const [showSettingsModal, setShowSettingsModal] = useState(false);\n  const [showMobileMenu, setShowMobileMenu] = useState(false);');

// 3. Update root layout wrapper
content = content.replace('<div className="flex w-full print:hidden">', '<div className="flex flex-col md:flex-row w-full print:hidden">');

// 4. Update Sidebar & Mobile Top Bar
const sidebarTarget = `{/* Sidebar */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className="w-64 sidebar-gradient border-r border-white/[0.06] flex flex-col p-6 sticky top-0 h-screen"
      >
        <div className="flex items-center gap-4 mb-12">`;

const sidebarReplacement = `{/* Mobile Top Bar */}
      <div className="md:hidden flex items-center justify-between p-4 border-b border-white/[0.06] bg-zinc-950 sticky top-0 z-50">
        <div className="flex items-center gap-3">
          <div className="w-8 h-8 rounded-lg bg-zinc-900 border border-zinc-800 flex items-center justify-center shadow-lg shadow-black">
            <BrainCircuit className="text-white w-4 h-4" />
          </div>
          <h1 className="text-lg font-bold tracking-tight">SRS<span className="text-gradient">Master</span></h1>
        </div>
        <button onClick={() => setShowMobileMenu(!showMobileMenu)} className="p-2 text-zinc-400 hover:text-white">
          {showMobileMenu ? <X className="w-6 h-6" /> : <Menu className="w-6 h-6" />}
        </button>
      </div>

      {/* Sidebar */}
      <motion.aside 
        initial={{ x: -300, opacity: 0 }}
        animate={{ x: 0, opacity: 1 }}
        transition={{ duration: 0.5, ease: "easeOut" }}
        className={\`\${showMobileMenu ? 'flex' : 'hidden'} md:flex w-full md:w-64 sidebar-gradient border-r border-white/[0.06] flex-col p-6 sticky md:top-0 h-[calc(100vh-73px)] md:h-screen z-40 overflow-y-auto\`}
      >
        <div className="hidden md:flex items-center gap-4 mb-12">`;
content = content.replace(sidebarTarget, sidebarReplacement);

// 5. Update Main wrapper
content = content.replace('<main className="flex-1 p-12 overflow-y-auto relative h-screen">', '<main className={`${showMobileMenu ? "hidden" : "block"} md:block flex-1 p-4 md:p-12 overflow-y-auto relative h-[calc(100vh-73px)] md:h-screen`}>');

// 6. Fix massive paddings/margins in content globally safely
content = content.replace(/className="([^"]*?) p-12([^"]*?)"/g, 'className="$1 p-4 md:p-12$2"');
content = content.replace(/className="([^"]*?) p-8([^"]*?)"/g, 'className="$1 p-4 md:p-8$2"');
content = content.replace(/className="([^"]*?) mb-12([^"]*?)"/g, 'className="$1 mb-6 md:mb-12$2"');

// 7. Fix nav buttons to close mobile menu
content = content.replace(/onClick=\{\(\) => setActiveTab\("(.*?)"\)\}/g, 'onClick={() => { setActiveTab("$1"); setShowMobileMenu(false); }}');
content = content.replace(/onClick=\{\(\) => setShowSettingsModal\(true\)\}/g, 'onClick={() => { setShowSettingsModal(true); setShowMobileMenu(false); }}');

fs.writeFileSync('src/app/page.tsx', content);
console.log("Applied responsive patches successfully.");
