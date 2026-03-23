/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect } from 'react';
import { 
  onAuthStateChanged, 
  signInWithPopup, 
  GoogleAuthProvider, 
  signOut, 
  User 
} from 'firebase/auth';
import { 
  collection, 
  query, 
  where, 
  onSnapshot, 
  addDoc, 
  serverTimestamp,
  doc,
  getDoc,
  setDoc,
  getDocFromServer
} from 'firebase/firestore';
import { auth, db } from './firebase';
import { 
  FileText, 
  BookOpen, 
  Edit3, 
  FileUp, 
  LogOut, 
  User as UserIcon, 
  Plus, 
  History,
  ChevronRight,
  Loader2,
  ShieldCheck,
  CheckCircle2,
  AlertCircle
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { generateQHSEDocument, generateSchoolProject, rewriteDocument, generatePermitToWork, extractTextFromPDF } from './services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

// --- Types ---
type Service = 'QHSE' | 'SOP' | 'Project' | 'Conversion' | 'Edit' | 'Dashboard' | 'Toolbox' | 'Permit' | 'Admin';

interface SavedDoc {
  id: string;
  title: string;
  type: string;
  content: string;
  ownerId: string;
  createdAt: any;
}

interface UserProfile {
  uid: string;
  email: string;
  displayName: string;
  role: 'user' | 'admin';
  createdAt: any;
}

// --- Components ---

const Button = ({ 
  children, 
  onClick, 
  variant = 'primary', 
  className, 
  disabled,
  loading
}: { 
  children: React.ReactNode; 
  onClick?: () => void; 
  variant?: 'primary' | 'secondary' | 'outline' | 'ghost' | 'danger';
  className?: string;
  disabled?: boolean;
  loading?: boolean;
}) => {
  const variants = {
    primary: 'bg-emerald-600 text-white hover:bg-emerald-700 shadow-sm',
    secondary: 'bg-zinc-900 text-white hover:bg-black shadow-sm',
    outline: 'border border-zinc-200 text-zinc-700 hover:bg-zinc-50',
    ghost: 'text-zinc-600 hover:bg-zinc-100',
    danger: 'bg-red-600 text-white hover:bg-red-700 shadow-sm'
  };

  return (
    <button 
      onClick={onClick}
      disabled={disabled || loading}
      className={cn(
        'px-4 py-2 rounded-lg font-medium transition-all flex items-center justify-center gap-2 disabled:opacity-50 disabled:cursor-not-allowed',
        variants[variant],
        className
      )}
    >
      {loading && <Loader2 className="w-4 h-4 animate-spin" />}
      {children}
    </button>
  );
};

const Card = ({ children, className, onClick }: { children: React.ReactNode; className?: string; onClick?: () => void }) => (
  <div 
    onClick={onClick}
    className={cn('bg-white border border-zinc-200 rounded-xl shadow-sm overflow-hidden', className, onClick && 'cursor-pointer')}
  >
    {children}
  </div>
);

const Input = ({ label, value, onChange, placeholder, type = 'text', required }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-zinc-700">{label}</label>}
    <input
      type={type}
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      required={required}
      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 placeholder:text-zinc-400"
    />
  </div>
);

const TextArea = ({ label, value, onChange, placeholder, rows = 4 }: any) => (
  <div className="space-y-1.5">
    {label && <label className="text-sm font-medium text-zinc-700">{label}</label>}
    <textarea
      value={value}
      onChange={(e) => onChange(e.target.value)}
      placeholder={placeholder}
      rows={rows}
      className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900 placeholder:text-zinc-400 resize-none"
    />
  </div>
);

// --- Main App Component ---

export default function App() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<Service>('Dashboard');
  const [documents, setDocuments] = useState<SavedDoc[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allDocs, setAllDocs] = useState<SavedDoc[]>([]);

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user profile exists in Firestore
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDoc(userRef);
        if (!userSnap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            role: 'user',
            createdAt: serverTimestamp()
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        } else {
          setUserProfile(userSnap.data() as UserProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return unsubscribe;
  }, []);

  // Admin Data Listener
  useEffect(() => {
    if (userProfile?.role !== 'admin') return;

    const usersUnsub = onSnapshot(collection(db, 'users'), (snap) => {
      setAllUsers(snap.docs.map(d => d.data() as UserProfile));
    });

    const docsUnsub = onSnapshot(collection(db, 'documents'), (snap) => {
      setAllDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedDoc)));
    });

    return () => {
      usersUnsub();
      docsUnsub();
    };
  }, [userProfile]);

  // Firestore Docs Listener
  useEffect(() => {
    if (!user) return;
    const q = query(collection(db, 'documents'), where('ownerId', '==', user.uid));
    const unsubscribe = onSnapshot(q, (snapshot) => {
      const docs = snapshot.docs.map(d => ({ id: d.id, ...d.data() } as SavedDoc));
      setDocuments(docs.sort((a, b) => b.createdAt?.seconds - a.createdAt?.seconds));
    });
    return unsubscribe;
  }, [user]);

  // Test Connection
  useEffect(() => {
    async function testConnection() {
      try {
        await getDocFromServer(doc(db, 'test', 'connection'));
      } catch (error) {
        if (error instanceof Error && error.message.includes('the client is offline')) {
          console.error("Please check your Firebase configuration.");
        }
      }
    }
    testConnection();
  }, []);

  const handleLogin = async () => {
    try {
      const provider = new GoogleAuthProvider();
      await signInWithPopup(auth, provider);
    } catch (err) {
      console.error(err);
      setError("Failed to sign in. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const saveDocument = async (title: string, type: string, content: string) => {
    if (!user) return;
    try {
      await addDoc(collection(db, 'documents'), {
        ownerId: user.uid,
        title,
        type,
        content,
        createdAt: serverTimestamp(),
        updatedAt: serverTimestamp()
      });
      setActiveService('Dashboard');
    } catch (err) {
      console.error(err);
      setError("Failed to save document.");
    }
  };

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-zinc-50">
        <Loader2 className="w-8 h-8 animate-spin text-emerald-600" />
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-zinc-50 flex flex-col items-center justify-center p-4">
        <motion.div 
          initial={{ opacity: 0, y: 20 }}
          animate={{ opacity: 1, y: 0 }}
          className="max-w-md w-full text-center space-y-8"
        >
          <div className="flex justify-center">
            <div className="w-16 h-16 bg-emerald-600 rounded-2xl flex items-center justify-center shadow-lg shadow-emerald-600/20">
              <ShieldCheck className="w-10 h-10 text-white" />
            </div>
          </div>
          <div className="space-y-2">
            <h1 className="text-4xl font-bold tracking-tight text-zinc-900">QHSEDocsPro</h1>
            <p className="text-zinc-500 text-lg">Professional QHSE & Academic Document Solutions</p>
          </div>
          <Card className="p-8 space-y-6">
            <p className="text-zinc-600">Sign in to access professional generators, editors, and your document history.</p>
            <Button onClick={handleLogin} className="w-full py-3 text-lg" variant="secondary">
              <img src="https://www.gstatic.com/firebasejs/ui/2.0.0/images/auth/google.svg" className="w-5 h-5 mr-2" alt="Google" />
              Sign in with Google
            </Button>
          </Card>
          <div className="flex justify-center gap-8 text-zinc-400 text-sm">
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Professional</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Human-like</div>
            <div className="flex items-center gap-1.5"><CheckCircle2 className="w-4 h-4" /> Secure</div>
          </div>
        </motion.div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Sidebar */}
      <aside className="w-72 bg-white border-r border-zinc-200 flex flex-col fixed h-full">
        <div className="p-6 border-bottom border-zinc-100">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 bg-emerald-600 rounded-xl flex items-center justify-center shadow-md shadow-emerald-600/10">
              <ShieldCheck className="w-6 h-6 text-white" />
            </div>
            <span className="font-bold text-xl tracking-tight text-zinc-900">QHSEDocsPro</span>
          </div>
        </div>

        <nav className="flex-1 p-4 space-y-1 overflow-y-auto">
          <p className="px-4 py-2 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Main</p>
          <SidebarItem 
            icon={<History className="w-5 h-5" />} 
            label="Dashboard" 
            active={activeService === 'Dashboard'} 
            onClick={() => setActiveService('Dashboard')} 
          />
          
          <p className="px-4 py-2 mt-6 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Services</p>
          <SidebarItem 
            icon={<FileText className="w-5 h-5" />} 
            label="QHSE Generator" 
            active={activeService === 'QHSE'} 
            onClick={() => setActiveService('QHSE')} 
          />
          <SidebarItem 
            icon={<CheckCircle2 className="w-5 h-5" />} 
            label="HSE SOP Generator" 
            active={activeService === 'SOP'} 
            onClick={() => setActiveService('SOP')} 
          />
          <SidebarItem 
            icon={<Plus className="w-5 h-5" />} 
            label="Toolbox Talk" 
            active={activeService === 'Toolbox'} 
            onClick={() => setActiveService('Toolbox')} 
          />
          <SidebarItem 
            icon={<BookOpen className="w-5 h-5" />} 
            label="School Project" 
            active={activeService === 'Project'} 
            onClick={() => setActiveService('Project')} 
          />
          <SidebarItem 
            icon={<Edit3 className="w-5 h-5" />} 
            label="Edit / Rewrite" 
            active={activeService === 'Edit'} 
            onClick={() => setActiveService('Edit')} 
          />
          <SidebarItem 
            icon={<FileUp className="w-5 h-5" />} 
            label="PDF to Word" 
            active={activeService === 'Conversion'} 
            onClick={() => setActiveService('Conversion')} 
          />
          <SidebarItem 
            icon={<ShieldCheck className="w-5 h-5" />} 
            label="Permit to Work" 
            active={activeService === 'Permit'} 
            onClick={() => setActiveService('Permit')} 
          />

          {userProfile?.role === 'admin' && (
            <>
              <p className="px-4 py-2 mt-6 text-xs font-semibold text-zinc-400 uppercase tracking-wider">Admin</p>
              <SidebarItem 
                icon={<UserIcon className="w-5 h-5" />} 
                label="Admin Panel" 
                active={activeService === 'Admin'} 
                onClick={() => setActiveService('Admin')} 
              />
            </>
          )}
        </nav>

        <div className="p-4 border-t border-zinc-100">
          <div className="flex items-center gap-3 p-3 rounded-xl bg-zinc-50 mb-4">
            <img src={user.photoURL || ''} className="w-10 h-10 rounded-full border border-white shadow-sm" alt="User" />
            <div className="flex-1 min-w-0">
              <p className="text-sm font-semibold text-zinc-900 truncate">{user.displayName}</p>
              <p className="text-xs text-zinc-500 truncate">{user.email}</p>
            </div>
          </div>
          <Button variant="ghost" className="w-full justify-start text-red-600 hover:text-red-700 hover:bg-red-50" onClick={handleLogout}>
            <LogOut className="w-5 h-5" /> Sign Out
          </Button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 ml-72 p-8">
        <div className="max-w-5xl mx-auto">
          <AnimatePresence mode="wait">
            {activeService === 'Dashboard' && (
              <motion.div key="dashboard" initial={{ opacity: 0, x: 10 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0, x: -10 }}>
                <div className="flex justify-between items-end mb-8">
                  <div>
                    <h2 className="text-3xl font-bold text-zinc-900">Welcome back, {user.displayName?.split(' ')[0]}</h2>
                    <p className="text-zinc-500">Manage your documents and start new projects.</p>
                  </div>
                  <Button onClick={() => setActiveService('QHSE')}>
                    <Plus className="w-5 h-5" /> New Document
                  </Button>
                </div>

                <div className="grid grid-cols-1 md:grid-cols-3 gap-6 mb-12">
                  <StatCard label="Total Documents" value={documents.length} icon={<FileText className="text-emerald-600" />} />
                  <StatCard label="Recent Activity" value="2 hours ago" icon={<History className="text-blue-600" />} />
                  <StatCard label="Account Status" value="Professional" icon={<ShieldCheck className="text-purple-600" />} />
                </div>

                <h3 className="text-xl font-bold text-zinc-900 mb-4">Recent Documents</h3>
                {documents.length > 0 ? (
                  <div className="grid grid-cols-1 gap-4">
                    {documents.map(doc => (
                      <Card key={doc.id} className="p-4 hover:border-emerald-500 transition-all cursor-pointer group" onClick={() => {
                        setCurrentDoc(doc.content);
                        setActiveService('Edit');
                      }}>
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4">
                            <div className="w-12 h-12 bg-zinc-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                              <FileText className="w-6 h-6 text-zinc-400 group-hover:text-emerald-600" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-zinc-900">{doc.title}</h4>
                              <p className="text-sm text-zinc-500">{doc.type} • {new Date(doc.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all" />
                        </div>
                      </Card>
                    ))}
                  </div>
                ) : (
                  <Card className="p-12 text-center space-y-4">
                    <div className="w-16 h-16 bg-zinc-50 rounded-full flex items-center justify-center mx-auto">
                      <FileText className="w-8 h-8 text-zinc-300" />
                    </div>
                    <p className="text-zinc-500">No documents yet. Start by generating one!</p>
                    <Button variant="outline" onClick={() => setActiveService('QHSE')}>Get Started</Button>
                  </Card>
                )}
              </motion.div>
            )}

            {activeService === 'QHSE' && (
              <QHSEGenerator 
                onGenerate={async (params) => {
                  setGenerating(true);
                  try {
                    const content = await generateQHSEDocument(params);
                    if (content) {
                      await saveDocument(`${params.companyName} - ${params.type}`, params.type, content);
                    }
                  } catch (err) {
                    console.error(err);
                    setError("Generation failed.");
                  } finally {
                    setGenerating(false);
                  }
                }} 
                loading={generating}
              />
            )}

            {activeService === 'SOP' && (
              <SOPGenerator 
                onGenerate={async (params: any) => {
                  setGenerating(true);
                  try {
                    const content = await generateQHSEDocument({ ...params, type: 'SOP' });
                    if (content) {
                      await saveDocument(`${params.companyName} - SOP`, 'SOP', content);
                    }
                  } catch (err) {
                    console.error(err);
                    setError("Generation failed.");
                  } finally {
                    setGenerating(false);
                  }
                }} 
                loading={generating}
              />
            )}

            {activeService === 'Toolbox' && (
              <ToolboxTalkGenerator 
                onGenerate={async (params: any) => {
                  setGenerating(true);
                  try {
                    const content = await generateQHSEDocument({ 
                      ...params, 
                      type: 'Toolbox Talk',
                      taskActivity: params.topic,
                      supervisorName: params.presenter,
                      hazards: params.keyPoints,
                      numWorkers: 'N/A',
                      ppe: 'N/A'
                    });
                    if (content) {
                      await saveDocument(`${params.topic} - Toolbox Talk`, 'Toolbox Talk', content);
                    }
                  } catch (err) {
                    console.error(err);
                    setError("Generation failed.");
                  } finally {
                    setGenerating(false);
                  }
                }} 
                loading={generating}
              />
            )}

            {activeService === 'Project' && (
              <ProjectWriter 
                onGenerate={async (params) => {
                  setGenerating(true);
                  try {
                    const content = await generateSchoolProject(params);
                    if (content) {
                      await saveDocument(params.topic, `Project (${params.level})`, content);
                    }
                  } catch (err) {
                    console.error(err);
                    setError("Generation failed.");
                  } finally {
                    setGenerating(false);
                  }
                }} 
                loading={generating}
              />
            )}

            {activeService === 'Edit' && (
              <Editor 
                initialContent={currentDoc || ''} 
                onSave={async (title, content) => {
                  await saveDocument(title, 'Edited Doc', content);
                }}
                onRewrite={async (content, instruction) => {
                  setGenerating(true);
                  try {
                    return await rewriteDocument(content, instruction);
                  } finally {
                    setGenerating(false);
                  }
                }}
                loading={generating}
              />
            )}

            {activeService === 'Conversion' && (
              <PDFWorkspace 
                onExtracted={async (content) => {
                  setCurrentDoc(content);
                  setActiveService('Edit');
                }}
                loading={generating}
                setLoading={setGenerating}
              />
            )}

            {activeService === 'Permit' && (
              <PermitGenerator 
                onGenerate={async (params: any) => {
                  setGenerating(true);
                  try {
                    const content = await generatePermitToWork(params);
                    if (content) {
                      await saveDocument(`${params.companyName} - Permit to Work`, 'Permit to Work', content);
                    }
                  } catch (err) {
                    console.error(err);
                    setError("Generation failed.");
                  } finally {
                    setGenerating(false);
                  }
                }} 
                loading={generating}
              />
            )}

            {activeService === 'Admin' && userProfile?.role === 'admin' && (
              <AdminDashboard 
                users={allUsers} 
                docs={allDocs} 
                onUpdateRole={async (uid, role) => {
                  try {
                    await setDoc(doc(db, 'users', uid), { role }, { merge: true });
                  } catch (err) {
                    console.error(err);
                    setError("Failed to update role.");
                  }
                }}
              />
            )}
          </AnimatePresence>
        </div>
      </main>

      {/* Error Toast */}
      <AnimatePresence>
        {error && (
          <motion.div 
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className="fixed bottom-8 right-8 z-50"
          >
            <div className="bg-red-600 text-white px-6 py-4 rounded-xl shadow-2xl flex items-center gap-3">
              <AlertCircle className="w-6 h-6" />
              <p className="font-medium">{error}</p>
              <button onClick={() => setError(null)} className="ml-4 hover:opacity-70">✕</button>
            </div>
          </motion.div>
        )}
      </AnimatePresence>
    </div>
  );
}

// --- Sub-components ---

const SidebarItem = ({ icon, label, active, onClick }: { icon: any; label: string; active: boolean; onClick: () => void }) => (
  <button
    onClick={onClick}
    className={cn(
      'w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all font-medium',
      active 
        ? 'bg-emerald-50 text-emerald-700 shadow-sm shadow-emerald-600/5' 
        : 'text-zinc-500 hover:bg-zinc-100 hover:text-zinc-900'
    )}
  >
    {icon}
    {label}
  </button>
);

const StatCard = ({ label, value, icon }: { label: string; value: string | number; icon: any }) => (
  <Card className="p-6">
    <div className="flex items-center justify-between mb-2">
      <span className="text-sm font-medium text-zinc-500">{label}</span>
      <div className="p-2 bg-zinc-50 rounded-lg">{icon}</div>
    </div>
    <p className="text-2xl font-bold text-zinc-900">{value}</p>
  </Card>
);

const QHSEGenerator = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({
    type: 'Risk Assessment',
    companyName: '',
    projectName: '',
    location: '',
    taskActivity: '',
    hazards: '',
    numWorkers: '',
    ppe: '',
    date: new Date().toISOString().split('T')[0],
    supervisorName: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-zinc-900">QHSE Document Generator</h2>
        <div className="flex gap-2">
          {['Risk Assessment', 'HSE Plan', 'HSE Policy', 'JHA', 'SWMS'].map(t => (
            <button 
              key={t}
              onClick={() => setParams({ ...params, type: t })}
              className={cn(
                "px-3 py-1 rounded-full text-xs font-semibold transition-all",
                params.type === t ? "bg-emerald-600 text-white" : "bg-zinc-200 text-zinc-600 hover:bg-zinc-300"
              )}
            >
              {t}
            </button>
          ))}
        </div>
      </div>
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Company Name" value={params.companyName} onChange={(v: string) => setParams({ ...params, companyName: v })} placeholder="e.g. Global Construction Ltd" />
          <Input label="Project Name" value={params.projectName} onChange={(v: string) => setParams({ ...params, projectName: v })} placeholder="e.g. Bridge Expansion Phase 1" />
          <Input label="Location" value={params.location} onChange={(v: string) => setParams({ ...params, location: v })} placeholder="e.g. Lagos, Nigeria" />
          <Input label="Supervisor Name" value={params.supervisorName} onChange={(v: string) => setParams({ ...params, supervisorName: v })} placeholder="e.g. Engr. Michael" />
          <Input label="Number of Workers" value={params.numWorkers} onChange={(v: string) => setParams({ ...params, numWorkers: v })} placeholder="e.g. 25" />
          <Input label="Date" type="date" value={params.date} onChange={(v: string) => setParams({ ...params, date: v })} />
          <div className="md:col-span-2">
            <TextArea label="Task / Activity" value={params.taskActivity} onChange={(v: string) => setParams({ ...params, taskActivity: v })} placeholder="Describe the work being done..." />
          </div>
          <div className="md:col-span-2">
            <TextArea label="Hazards Identified" value={params.hazards} onChange={(v: string) => setParams({ ...params, hazards: v })} placeholder="List potential risks..." />
          </div>
          <div className="md:col-span-2">
            <TextArea label="Required PPE" value={params.ppe} onChange={(v: string) => setParams({ ...params, ppe: v })} placeholder="e.g. Hard hat, safety boots, high-vis vest..." />
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Professional {params.type}
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const SOPGenerator = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({
    companyName: '',
    projectName: '',
    location: '',
    taskActivity: '',
    hazards: '',
    numWorkers: '',
    ppe: '',
    date: new Date().toISOString().split('T')[0],
    supervisorName: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">HSE SOP Generator</h2>
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Company Name" value={params.companyName} onChange={(v: string) => setParams({ ...params, companyName: v })} />
          <Input label="SOP Title / Activity" value={params.taskActivity} onChange={(v: string) => setParams({ ...params, taskActivity: v })} placeholder="e.g. Working at Heights" />
          <div className="md:col-span-2">
            <TextArea label="Hazards & Risks" value={params.hazards} onChange={(v: string) => setParams({ ...params, hazards: v })} />
          </div>
          <div className="md:col-span-2">
            <TextArea label="Required PPE" value={params.ppe} onChange={(v: string) => setParams({ ...params, ppe: v })} />
          </div>
          <Input label="Supervisor" value={params.supervisorName} onChange={(v: string) => setParams({ ...params, supervisorName: v })} />
          <Input label="Date" type="date" value={params.date} onChange={(v: string) => setParams({ ...params, date: v })} />
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Professional SOP
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const ToolboxTalkGenerator = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({
    companyName: '',
    topic: '',
    location: '',
    presenter: '',
    date: new Date().toISOString().split('T')[0],
    keyPoints: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">Toolbox Talk Generator</h2>
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Company Name" value={params.companyName} onChange={(v: string) => setParams({ ...params, companyName: v })} placeholder="e.g. BuildRight Construction" />
          <Input label="Talk Topic" value={params.topic} onChange={(v: string) => setParams({ ...params, topic: v })} placeholder="e.g. Fire Safety Awareness" />
          <Input label="Location / Site" value={params.location} onChange={(v: string) => setParams({ ...params, location: v })} placeholder="e.g. Main Site Office" />
          <Input label="Presenter / Supervisor" value={params.presenter} onChange={(v: string) => setParams({ ...params, presenter: v })} placeholder="e.g. John Smith" />
          <Input label="Date" type="date" value={params.date} onChange={(v: string) => setParams({ ...params, date: v })} />
          <div className="md:col-span-2">
            <TextArea label="Key Points to Cover" value={params.keyPoints} onChange={(v: string) => setParams({ ...params, keyPoints: v })} placeholder="List the main safety points or recent incidents to discuss..." />
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Toolbox Talk
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const ProjectWriter = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({ topic: '', level: 'BSc' });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">School Project Write-up</h2>
      <Card className="p-8">
        <div className="space-y-6">
          <Input label="Project Topic" value={params.topic} onChange={(v: string) => setParams({ ...params, topic: v })} placeholder="e.g. Impact of HSE Management on Construction Productivity" />
          <div className="space-y-2">
            <label className="text-sm font-medium text-zinc-700">Academic Level</label>
            <div className="flex gap-4">
              {['ND', 'HND', 'BSc', 'MSc'].map(l => (
                <button 
                  key={l}
                  onClick={() => setParams({ ...params, level: l })}
                  className={cn(
                    "flex-1 py-3 rounded-xl border-2 transition-all font-bold",
                    params.level === l 
                      ? "border-emerald-600 bg-emerald-50 text-emerald-700" 
                      : "border-zinc-100 bg-zinc-50 text-zinc-400 hover:border-zinc-200"
                  )}
                >
                  {l}
                </button>
              ))}
            </div>
          </div>
          <div className="p-4 bg-blue-50 rounded-xl flex gap-3">
            <AlertCircle className="w-5 h-5 text-blue-600 shrink-0" />
            <p className="text-sm text-blue-700">Our AI generates human-written, natural academic content that avoids robotic phrasing and is plagiarism-free.</p>
          </div>
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Full Project Write-up
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const PermitGenerator = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({
    companyName: '',
    projectName: '',
    location: '',
    taskActivity: '',
    duration: '',
    authorizedPersonnel: '',
    safetyPrecautions: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">Permit to Work Generator</h2>
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <Input label="Company Name" value={params.companyName} onChange={(v: string) => setParams({ ...params, companyName: v })} />
          <Input label="Project Name" value={params.projectName} onChange={(v: string) => setParams({ ...params, projectName: v })} />
          <Input label="Location" value={params.location} onChange={(v: string) => setParams({ ...params, location: v })} />
          <Input label="Duration" value={params.duration} onChange={(v: string) => setParams({ ...params, duration: v })} placeholder="e.g. 8:00 AM to 5:00 PM" />
          <div className="md:col-span-2">
            <TextArea label="Activity Description" value={params.taskActivity} onChange={(v: string) => setParams({ ...params, taskActivity: v })} />
          </div>
          <div className="md:col-span-2">
            <TextArea label="Authorized Personnel" value={params.authorizedPersonnel} onChange={(v: string) => setParams({ ...params, authorizedPersonnel: v })} placeholder="List names and roles..." />
          </div>
          <div className="md:col-span-2">
            <TextArea label="Safety Precautions" value={params.safetyPrecautions} onChange={(v: string) => setParams({ ...params, safetyPrecautions: v })} />
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Permit to Work
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const AdminDashboard = ({ users, docs, onUpdateRole }: any) => {
  const [view, setView] = useState<'users' | 'docs'>('users');

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-zinc-900">Admin Dashboard</h2>
        <div className="flex gap-2">
          <Button variant={view === 'users' ? 'secondary' : 'outline'} onClick={() => setView('users')}>Users</Button>
          <Button variant={view === 'docs' ? 'secondary' : 'outline'} onClick={() => setView('docs')}>Documents</Button>
        </div>
      </div>

      {view === 'users' ? (
        <Card>
          <table className="w-full text-left">
            <thead className="bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="p-4 font-semibold text-zinc-600">User</th>
                <th className="p-4 font-semibold text-zinc-600">Email</th>
                <th className="p-4 font-semibold text-zinc-600">Role</th>
                <th className="p-4 font-semibold text-zinc-600">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {users.map((u: UserProfile) => (
                <tr key={u.uid}>
                  <td className="p-4 font-medium">{u.displayName}</td>
                  <td className="p-4 text-zinc-500">{u.email}</td>
                  <td className="p-4">
                    <span className={cn(
                      "px-2 py-1 rounded-full text-xs font-bold",
                      u.role === 'admin' ? "bg-purple-100 text-purple-700" : "bg-zinc-100 text-zinc-600"
                    )}>
                      {u.role.toUpperCase()}
                    </span>
                  </td>
                  <td className="p-4">
                    <select 
                      value={u.role} 
                      onChange={(e) => onUpdateRole(u.uid, e.target.value)}
                      className="text-sm border border-zinc-200 rounded px-2 py-1"
                    >
                      <option value="user">User</option>
                      <option value="admin">Admin</option>
                    </select>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      ) : (
        <Card>
          <table className="w-full text-left">
            <thead className="bg-zinc-50 border-b border-zinc-100">
              <tr>
                <th className="p-4 font-semibold text-zinc-600">Title</th>
                <th className="p-4 font-semibold text-zinc-600">Type</th>
                <th className="p-4 font-semibold text-zinc-600">Owner ID</th>
                <th className="p-4 font-semibold text-zinc-600">Date</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-zinc-100">
              {docs.map((d: SavedDoc) => (
                <tr key={d.id}>
                  <td className="p-4 font-medium">{d.title}</td>
                  <td className="p-4 text-zinc-500">{d.type}</td>
                  <td className="p-4 text-xs font-mono text-zinc-400">{d.ownerId}</td>
                  <td className="p-4 text-zinc-500">{new Date(d.createdAt?.seconds * 1000).toLocaleDateString()}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </Card>
      )}
    </motion.div>
  );
};

const PDFWorkspace = ({ onExtracted, loading, setLoading }: any) => {
  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      const arrayBuffer = await file.arrayBuffer();
      const pdf = await pdfjsLib.getDocument({ data: arrayBuffer }).promise;
      let fullText = "";

      for (let i = 1; i <= pdf.numPages; i++) {
        const page = await pdf.getPage(i);
        const textContent = await page.getTextContent();
        const pageText = textContent.items.map((item: any) => item.str).join(" ");
        fullText += `--- Page ${i} ---\n${pageText}\n\n`;
      }

      const markdown = await extractTextFromPDF(fullText);
      onExtracted(markdown);
    } catch (err) {
      console.error(err);
      alert("Failed to process PDF.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">PDF to Word & Editor</h2>
      <Card className="p-12 text-center border-dashed border-2 border-zinc-200 bg-zinc-50/50">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            {loading ? <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /> : <FileUp className="w-8 h-8 text-emerald-600" />}
          </div>
          <div>
            <h3 className="font-bold text-lg text-zinc-900">Enhanced PDF Processing</h3>
            <p className="text-zinc-500">Upload your PDF to extract text, maintain tables, and edit content with AI.</p>
          </div>
          <input type="file" className="hidden" id="pdf-upload" accept=".pdf" onChange={handleFileUpload} />
          <Button variant="secondary" className="w-full" loading={loading} onClick={() => document.getElementById('pdf-upload')?.click()}>
            Select PDF File
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const Editor = ({ initialContent, onSave, onRewrite, loading }: any) => {
  const [content, setContent] = useState(initialContent);
  const [title, setTitle] = useState('New Document');
  const [instruction, setInstruction] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');

  useEffect(() => {
    setContent(initialContent);
  }, [initialContent]);

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <div className="flex-1 mr-4">
          <input 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            className="text-3xl font-bold text-zinc-900 bg-transparent border-none focus:ring-0 w-full"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={() => setView(view === 'edit' ? 'preview' : 'edit')}>
            {view === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          <Button onClick={() => onSave(title, content)}>Save Document</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <Card className="min-h-[600px] flex flex-col">
            {view === 'edit' ? (
              <textarea
                value={content}
                onChange={(e) => setContent(e.target.value)}
                className="flex-1 p-8 focus:outline-none resize-none font-mono text-sm leading-relaxed"
                placeholder="Start writing or generate content..."
              />
            ) : (
              <div className="p-8 prose prose-zinc max-w-none">
                <Markdown>{content}</Markdown>
              </div>
            )}
          </Card>
        </div>
        
        <div className="space-y-6">
          <Card className="p-6 space-y-4">
            <h3 className="font-bold text-zinc-900 flex items-center gap-2">
              <Edit3 className="w-4 h-4" /> AI Assistant
            </h3>
            <TextArea 
              label="Rewrite Instruction" 
              placeholder="e.g. Make it more professional, fix grammar, or add a section on..." 
              value={instruction}
              onChange={setInstruction}
            />
            <Button 
              variant="secondary" 
              className="w-full" 
              loading={loading}
              onClick={async () => {
                const newContent = await onRewrite(content, instruction);
                if (newContent) setContent(newContent);
              }}
            >
              Apply AI Edit
            </Button>
          </Card>

          <Card className="p-6">
            <h3 className="font-bold text-zinc-900 mb-4">Document Info</h3>
            <div className="space-y-2 text-sm text-zinc-500">
              <div className="flex justify-between">
                <span>Words:</span>
                <span className="font-medium text-zinc-900">{content.split(/\s+/).filter(Boolean).length}</span>
              </div>
              <div className="flex justify-between">
                <span>Characters:</span>
                <span className="font-medium text-zinc-900">{content.length}</span>
              </div>
            </div>
          </Card>
        </div>
      </div>
    </motion.div>
  );
};
