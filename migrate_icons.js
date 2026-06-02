const fs = require('fs');

let content = fs.readFileSync('src/app/page.tsx', 'utf8');

// 1. Remove lucide-react imports completely
content = content.replace(/import\s*\{[^}]*\}\s*from\s*["']lucide-react["'];/gs, '');

// 2. Add heroicons import at the top (after framer-motion)
const heroImports = `import { 
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
} from "@heroicons/react/24/outline";`;

content = content.replace(/import { motion, AnimatePresence } from "framer-motion";/, `import { motion, AnimatePresence } from "framer-motion";\n${heroImports}`);

// 3. Component mapping
const iconMap = {
  '<BrainCircuit ': '<CpuChipIcon ',
  '<BookOpen ': '<BookOpenIcon ',
  '<CalendarDays ': '<CalendarDaysIcon ',
  '<ChevronRight ': '<ChevronRightIcon ',
  '<Sparkles ': '<SparklesIcon ',
  '<CheckCircle2 ': '<CheckCircleIcon ',
  '<Clock ': '<ClockIcon ',
  '<Loader2 ': '<ArrowPathIcon ',
  '<FileText ': '<DocumentTextIcon ',
  '<Copy ': '<DocumentDuplicateIcon ',
  '<Check ': '<CheckIcon ',
  '<ArrowLeft ': '<ArrowLeftIcon ',
  '<X ': '<XMarkIcon ',
  '<Menu ': '<Bars3Icon ',
  '<GraduationCap ': '<AcademicCapIcon ',
  '<ChevronDown ': '<ChevronDownIcon ',
  '<UploadCloud ': '<CloudArrowUpIcon ',
  '<AlertTriangle ': '<ExclamationTriangleIcon ',
  '<Printer ': '<PrinterIcon ',
  '<Trash2 ': '<TrashIcon ',
  '<Settings ': '<Cog8ToothIcon ',
  '<Bell ': '<BellIcon ',
  '<BellOff ': '<BellSlashIcon '
};

Object.keys(iconMap).forEach(key => {
  content = content.split(key).join(iconMap[key]);
});

fs.writeFileSync('src/app/page.tsx', content);
console.log("Migration to Heroicons complete.");
