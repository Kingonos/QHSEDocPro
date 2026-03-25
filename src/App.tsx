/**
 * @license
 * SPDX-License-Identifier: Apache-2.0
 */

import React, { useState, useEffect, Component, ErrorInfo, ReactNode } from 'react';
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
  getDocFromServer,
  orderBy,
  getDocs
} from 'firebase/firestore';
import { auth, db } from './firebase';

enum OperationType {
  CREATE = 'create',
  UPDATE = 'update',
  DELETE = 'delete',
  LIST = 'list',
  GET = 'get',
  WRITE = 'write',
}

interface FirestoreErrorInfo {
  error: string;
  operationType: OperationType;
  path: string | null;
  authInfo: {
    userId: string | undefined;
    email: string | null | undefined;
    emailVerified: boolean | undefined;
    isAnonymous: boolean | undefined;
    tenantId: string | null | undefined;
    providerInfo: {
      providerId: string;
      displayName: string | null;
      email: string | null;
      photoUrl: string | null;
    }[];
  }
}

function handleFirestoreError(error: unknown, operationType: OperationType, path: string | null) {
  const errInfo: FirestoreErrorInfo = {
    error: error instanceof Error ? error.message : String(error),
    authInfo: {
      userId: auth.currentUser?.uid,
      email: auth.currentUser?.email,
      emailVerified: auth.currentUser?.emailVerified,
      isAnonymous: auth.currentUser?.isAnonymous,
      tenantId: auth.currentUser?.tenantId,
      providerInfo: auth.currentUser?.providerData.map(provider => ({
        providerId: provider.providerId,
        displayName: provider.displayName,
        email: provider.email,
        photoUrl: provider.photoURL
      })) || []
    },
    operationType,
    path
  }
  console.error('Firestore Error: ', JSON.stringify(errInfo));
  throw new Error(JSON.stringify(errInfo));
}

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
  AlertCircle,
  X,
  Copy,
  Download,
  Presentation
} from 'lucide-react';
import { motion, AnimatePresence } from 'motion/react';
import { clsx, type ClassValue } from 'clsx';
import { twMerge } from 'tailwind-merge';
import Markdown from 'react-markdown';
import { marked } from 'marked';
import { generateQHSEDocument, generateSchoolProject, rewriteDocument, generatePermitToWork, extractTextFromPDF, generatePresentation } from './services/geminiService';
import * as pdfjsLib from 'pdfjs-dist';
import { PDFDocument, rgb, StandardFonts } from 'pdf-lib';
import * as mammoth from 'mammoth';
import JSZip from 'jszip';

// Set up PDF.js worker
pdfjsLib.GlobalWorkerOptions.workerSrc = `//cdnjs.cloudflare.com/ajax/libs/pdf.js/${pdfjsLib.version}/pdf.worker.min.js`;

// Utility for tailwind classes
function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

const downloadAsWord = async (content: string, title: string) => {
  const htmlContent = await marked.parse(content);
  const header = `<html xmlns:o='urn:schemas-microsoft-com:office:office' xmlns:w='urn:schemas-microsoft-com:office:word' xmlns='http://www.w3.org/TR/REC-html40'><head><meta charset='utf-8'><title>${title}</title></head><body>`;
  const footer = "</body></html>";
  const sourceHTML = header + htmlContent + footer;
  
  const blob = new Blob(['\ufeff', sourceHTML], {
    type: 'application/msword'
  });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = `${title || 'document'}.doc`;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
};

// --- Types ---
type Service = 'QHSE' | 'SOP' | 'Project' | 'Conversion' | 'Edit' | 'Dashboard' | 'Toolbox' | 'Permit' | 'Presentation' | 'Admin';

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
  permissions?: string[];
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
  onClick?: (e?: any) => void; 
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

class ErrorBoundary extends Component<{ children: ReactNode }, { hasError: boolean, error: Error | null }> {
  constructor(props: { children: ReactNode }) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error) {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("Uncaught error:", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let errorMessage = "An unexpected error occurred.";
      try {
        if (this.state.error?.message) {
          const parsed = JSON.parse(this.state.error.message);
          if (parsed.error) {
            errorMessage = parsed.error;
          }
        }
      } catch (e) {
        errorMessage = this.state.error?.message || errorMessage;
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-zinc-50 p-4">
          <Card className="max-w-md w-full p-8 text-center space-y-4">
            <div className="w-16 h-16 bg-red-100 text-red-600 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertCircle className="w-8 h-8" />
            </div>
            <h2 className="text-2xl font-bold text-zinc-900">Something went wrong</h2>
            <p className="text-zinc-600">{errorMessage}</p>
            <Button className="mt-6" onClick={() => window.location.reload()}>
              Reload Application
            </Button>
          </Card>
        </div>
      );
    }

    return this.props.children;
  }
}

// --- Main App Component ---

export default function AppWrapper() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeService, setActiveService] = useState<Service>('Dashboard');
  const [documents, setDocuments] = useState<SavedDoc[]>([]);
  const [generating, setGenerating] = useState(false);
  const [currentDoc, setCurrentDoc] = useState<{ id?: string, title: string, content: string, type: string } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [allUsers, setAllUsers] = useState<UserProfile[]>([]);
  const [allDocs, setAllDocs] = useState<SavedDoc[]>([]);
  const [toast, setToast] = useState<{ message: string; type: 'success' | 'info' } | null>(null);

  const showToast = (message: string, type: 'success' | 'info' = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 5000);
  };

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Ensure user profile exists in Firestore
        const userRef = doc(db, 'users', u.uid);
        let userSnap;
        try {
          userSnap = await getDoc(userRef);
        } catch (error) {
          handleFirestoreError(error, OperationType.GET, `users/${u.uid}`);
          throw error;
        }
        
        if (!userSnap.exists()) {
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            displayName: u.displayName || '',
            role: 'user',
            createdAt: serverTimestamp()
          };
          try {
            await setDoc(userRef, newProfile);
          } catch (error) {
            handleFirestoreError(error, OperationType.WRITE, `users/${u.uid}`);
          }
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'users');
    });

    const docsUnsub = onSnapshot(collection(db, 'documents'), (snap) => {
      setAllDocs(snap.docs.map(d => ({ id: d.id, ...d.data() } as SavedDoc)));
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
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
    }, (error) => {
      handleFirestoreError(error, OperationType.LIST, 'documents');
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
    } catch (err: any) {
      if (err.code === 'auth/cancelled-popup-request' || err.code === 'auth/popup-closed-by-user') {
        console.warn('Sign-in popup was cancelled or closed.');
        return;
      }
      console.error(err);
      setError("Failed to sign in. Please try again.");
    }
  };

  const handleLogout = () => signOut(auth);

  const sendEmailNotification = async (to: string, subject: string, text: string) => {
    try {
      await addDoc(collection(db, 'mail'), {
        to,
        message: {
          subject,
          text,
          html: `<p>${text.replace(/\n/g, '<br>')}</p>`
        }
      });
    } catch (err) {
      handleFirestoreError(err, OperationType.CREATE, 'mail');
      console.error("Failed to queue email notification:", err);
    }
  };

  const saveDocument = async (title: string, type: string, content: string, existingId?: string) => {
    if (!user) return;
    try {
      if (existingId) {
        const docRef = doc(db, 'documents', existingId);
        try {
          await setDoc(docRef, {
            title,
            content,
            updatedAt: serverTimestamp()
          }, { merge: true });
        } catch (error) {
          handleFirestoreError(error, OperationType.UPDATE, `documents/${existingId}`);
        }

        // Save version history
        const versionRef = collection(db, 'documents', existingId, 'versions');
        try {
          await addDoc(versionRef, {
            content,
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `documents/${existingId}/versions`);
        }
        showToast(`Document "${title}" updated and version saved.`);
      } else {
        let docRef;
        try {
          docRef = await addDoc(collection(db, 'documents'), {
            ownerId: user.uid,
            title,
            type,
            content,
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, 'documents');
          throw error;
        }
        
        // Save initial version
        const versionRef = collection(db, 'documents', docRef.id, 'versions');
        try {
          await addDoc(versionRef, {
            content,
            createdAt: serverTimestamp(),
            createdBy: user.uid
          });
        } catch (error) {
          handleFirestoreError(error, OperationType.CREATE, `documents/${docRef.id}/versions`);
        }
        showToast(`Document "${title}" saved successfully.`);
        if (userProfile?.email) {
          sendEmailNotification(userProfile.email, `Document Generated: ${title}`, `Your document "${title}" of type ${type} has been successfully generated and saved to your dashboard.`);
        }
      }
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

  const hasPermission = (service: string) => {
    if (userProfile?.role === 'admin') return true;
    if (!userProfile?.permissions) return true; // Default to all if not set
    return userProfile.permissions.includes(service);
  };

  return (
    <div className="min-h-screen bg-zinc-50 flex">
      {/* Toast Notification */}
      <AnimatePresence>
        {toast && (
          <motion.div
            initial={{ opacity: 0, y: 50 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0, y: 50 }}
            className={cn(
              "fixed bottom-6 right-6 px-6 py-3 rounded-xl shadow-lg border text-sm font-medium z-50 flex items-center gap-2",
              toast.type === 'success' ? "bg-emerald-50 border-emerald-200 text-emerald-800" : "bg-blue-50 border-blue-200 text-blue-800"
            )}
          >
            {toast.type === 'success' ? <CheckCircle2 className="w-5 h-5" /> : <AlertCircle className="w-5 h-5" />}
            {toast.message}
          </motion.div>
        )}
      </AnimatePresence>

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
          {hasPermission('QHSE') && (
            <SidebarItem 
              icon={<FileText className="w-5 h-5" />} 
              label="QHSE Generator" 
              active={activeService === 'QHSE'} 
              onClick={() => setActiveService('QHSE')} 
            />
          )}
          {hasPermission('SOP') && (
            <SidebarItem 
              icon={<CheckCircle2 className="w-5 h-5" />} 
              label="HSE SOP Generator" 
              active={activeService === 'SOP'} 
              onClick={() => setActiveService('SOP')} 
            />
          )}
          {hasPermission('Toolbox') && (
            <SidebarItem 
              icon={<Plus className="w-5 h-5" />} 
              label="Toolbox Talk" 
              active={activeService === 'Toolbox'} 
              onClick={() => setActiveService('Toolbox')} 
            />
          )}
          {hasPermission('Project') && (
            <SidebarItem 
              icon={<BookOpen className="w-5 h-5" />} 
              label="School Project" 
              active={activeService === 'Project'} 
              onClick={() => setActiveService('Project')} 
            />
          )}
          <SidebarItem 
            icon={<Edit3 className="w-5 h-5" />} 
            label="Edit / Rewrite" 
            active={activeService === 'Edit'} 
            onClick={() => setActiveService('Edit')} 
          />
          {hasPermission('Conversion') && (
            <SidebarItem 
              icon={<FileUp className="w-5 h-5" />} 
              label="PDF to Word" 
              active={activeService === 'Conversion'} 
              onClick={() => setActiveService('Conversion')} 
            />
          )}
          {hasPermission('Permit') && (
            <SidebarItem 
              icon={<ShieldCheck className="w-5 h-5" />} 
              label="Permit to Work" 
              active={activeService === 'Permit'} 
              onClick={() => setActiveService('Permit')} 
            />
          )}
          {hasPermission('Presentation') && (
            <SidebarItem 
              icon={<Presentation className="w-5 h-5" />} 
              label="Presentation Slides" 
              active={activeService === 'Presentation'} 
              onClick={() => setActiveService('Presentation')} 
            />
          )}

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
                      <Card key={doc.id} className="p-4 hover:border-emerald-500 transition-all group">
                        <div className="flex items-center justify-between">
                          <div className="flex items-center gap-4 cursor-pointer flex-1" onClick={() => {
                            setCurrentDoc({ id: doc.id, title: doc.title, content: doc.content, type: doc.type });
                            setActiveService('Edit');
                          }}>
                            <div className="w-12 h-12 bg-zinc-50 rounded-lg flex items-center justify-center group-hover:bg-emerald-50 transition-colors">
                              <FileText className="w-6 h-6 text-zinc-400 group-hover:text-emerald-600" />
                            </div>
                            <div>
                              <h4 className="font-semibold text-zinc-900">{doc.title}</h4>
                              <p className="text-sm text-zinc-500">{doc.type} • {new Date(doc.createdAt?.seconds * 1000).toLocaleDateString()}</p>
                            </div>
                          </div>
                          <div className="flex items-center gap-2">
                            <Button variant="ghost" onClick={(e) => { e.stopPropagation(); downloadAsWord(doc.content, doc.title); }} className="text-zinc-500 hover:text-emerald-600">
                              <Download className="w-4 h-4" />
                            </Button>
                            <ChevronRight className="w-5 h-5 text-zinc-300 group-hover:text-emerald-500 group-hover:translate-x-1 transition-all cursor-pointer" onClick={() => {
                              setCurrentDoc({ id: doc.id, title: doc.title, content: doc.content, type: doc.type });
                              setActiveService('Edit');
                            }} />
                          </div>
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
                      setCurrentDoc({ title: `${params.companyName} - ${params.type}`, content, type: params.type });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Document Generated: ${params.type}`, `Your document "${params.companyName} - ${params.type}" has been successfully generated and is ready for editing.`);
                      }
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
                      setCurrentDoc({ title: `${params.companyName} - SOP`, content, type: 'SOP' });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Document Generated: SOP`, `Your SOP for "${params.companyName}" has been successfully generated and is ready for editing.`);
                      }
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
                      setCurrentDoc({ title: `${params.topic} - Toolbox Talk`, content, type: 'Toolbox Talk' });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Document Generated: Toolbox Talk`, `Your Toolbox Talk on "${params.topic}" has been successfully generated and is ready for editing.`);
                      }
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
                      setCurrentDoc({ title: `Project (${params.level})`, content, type: 'School Project' });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Project Generated`, `Your academic project on "${params.topic}" has been successfully generated and is ready for editing.`);
                      }
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

            {activeService === 'Edit' && currentDoc && (
              <Editor 
                docData={currentDoc} 
                onSave={async (title, content) => {
                  await saveDocument(title, currentDoc.type, content, currentDoc.id);
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
                  setCurrentDoc({ title: 'Extracted PDF', content, type: 'Converted PDF' });
                  setActiveService('Edit');
                  if (userProfile?.email) {
                    sendEmailNotification(userProfile.email, `PDF Conversion Complete`, `Your PDF has been successfully converted to editable text.`);
                  }
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
                      setCurrentDoc({ title: `${params.companyName} - Permit to Work`, content, type: 'Permit to Work' });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Document Generated: Permit to Work`, `Your Permit to Work for "${params.companyName}" has been successfully generated and is ready for editing.`);
                      }
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

            {activeService === 'Presentation' && (
              <PresentationGenerator 
                onGenerate={async (params: any) => {
                  setGenerating(true);
                  try {
                    const content = await generatePresentation(params);
                    if (content) {
                      setCurrentDoc({ title: `${params.topic} - Presentation`, content, type: 'Presentation' });
                      setActiveService('Edit');
                      if (userProfile?.email) {
                        sendEmailNotification(userProfile.email, `Document Generated: Presentation`, `Your presentation on "${params.topic}" has been successfully generated and is ready for editing.`);
                      }
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
                onUpdateUser={async (uid: string, updates: any) => {
                  try {
                    await setDoc(doc(db, 'users', uid), updates, { merge: true });
                    showToast(`User updated successfully.`, 'success');
                    const updatedUser = allUsers.find(u => u.uid === uid);
                    if (updatedUser?.email) {
                      const changes = Object.keys(updates).map(k => `${k} changed to ${JSON.stringify(updates[k])}`).join(', ');
                      sendEmailNotification(updatedUser.email, `Account Updated`, `Your account has been updated by an administrator. Changes: ${changes}`);
                    }
                  } catch (err) {
                    handleFirestoreError(err, OperationType.UPDATE, `users/${uid}`);
                    console.error(err);
                    showToast("Failed to update user.", 'info');
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

const DocumentUploader = ({ onUpload, id = "doc-upload" }: { onUpload: (text: string) => void, id?: string }) => {
  const [loading, setLoading] = useState(false);

  const handleFileUpload = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setLoading(true);
    try {
      if (file.type === 'application/pdf') {
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
        onUpload(markdown);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        onUpload(result.value);
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.presentationml.presentation' || file.name.endsWith('.pptx')) {
        const arrayBuffer = await file.arrayBuffer();
        const zip = await JSZip.loadAsync(arrayBuffer);
        let fullText = "";
        
        const slideFiles = Object.keys(zip.files).filter(name => name.match(/^ppt\/slides\/slide\d+\.xml$/));
        
        slideFiles.sort((a, b) => {
          const numA = parseInt(a.match(/\d+/)?.[0] || "0");
          const numB = parseInt(b.match(/\d+/)?.[0] || "0");
          return numA - numB;
        });

        for (const slideFile of slideFiles) {
          const content = await zip.files[slideFile].async("text");
          const matches = content.match(/<a:t[^>]*>(.*?)<\/a:t>/g);
          if (matches) {
            const slideText = matches.map(m => m.replace(/<[^>]+>/g, '')).join(' ');
            fullText += `--- ${slideFile} ---\n${slideText}\n\n`;
          }
        }
        
        onUpload(fullText);
      } else if (file.type === 'text/plain') {
        const text = await file.text();
        onUpload(text);
      } else {
        alert("Unsupported file format. Please upload a PDF, DOCX, PPTX, or TXT file.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to process document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <div className="w-full">
      <input type="file" className="hidden" id={id} accept=".pdf,.txt,.docx,.pptx" onChange={handleFileUpload} />
      <Button variant="secondary" className="w-full flex items-center justify-center gap-2" loading={loading} onClick={() => document.getElementById(id)?.click()}>
        <FileUp className="w-4 h-4" />
        Upload Existing Document (PDF/DOCX/PPTX/TXT)
      </Button>
    </div>
  );
};

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
    supervisorName: '',
    formatStyle: 'Corporate Standard',
    existingDocument: '',
    updateInstructions: '',
    time: '',
    description: '',
    involvedParties: '',
    immediateActions: '',
    witnesses: '',
    existingControls: '',
    proposedControls: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-zinc-900">QHSE Document Generator</h2>
        <div className="flex gap-2 flex-wrap">
          {['Risk Assessment', 'HSE Plan', 'HSE Policy', 'Job Hazard Analysis (JHA)', 'SWMS', 'Incident Report'].map(t => (
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
          
          {params.type !== 'Incident Report' && (
            <Input label="Supervisor Name" value={params.supervisorName} onChange={(v: string) => setParams({ ...params, supervisorName: v })} placeholder="e.g. Engr. Michael" />
          )}
          
          {params.type !== 'Incident Report' && params.type !== 'Job Hazard Analysis (JHA)' && (
            <Input label="Number of Workers" value={params.numWorkers} onChange={(v: string) => setParams({ ...params, numWorkers: v })} placeholder="e.g. 25" />
          )}
          
          <Input label="Date" type="date" value={params.date} onChange={(v: string) => setParams({ ...params, date: v })} />
          
          {params.type === 'Incident Report' && (
            <Input label="Time of Incident" type="time" value={params.time} onChange={(v: string) => setParams({ ...params, time: v })} />
          )}
          
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Format Style</label>
            <select 
              value={params.formatStyle} 
              onChange={(e) => setParams({ ...params, formatStyle: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900"
            >
              <option value="Corporate Standard">Corporate Standard</option>
              <option value="ISO 45001 Compliant">ISO 45001 Compliant</option>
              <option value="Minimalist / Field-Ready">Minimalist / Field-Ready</option>
            </select>
          </div>

          {params.type === 'Incident Report' ? (
            <>
              <div className="md:col-span-2">
                <TextArea label="Description of Incident" value={params.description} onChange={(v: string) => setParams({ ...params, description: v })} placeholder="Describe what happened..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Involved Parties" value={params.involvedParties} onChange={(v: string) => setParams({ ...params, involvedParties: v })} placeholder="Names and roles of people involved..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Immediate Actions Taken" value={params.immediateActions} onChange={(v: string) => setParams({ ...params, immediateActions: v })} placeholder="What was done immediately after the incident..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Witnesses" value={params.witnesses} onChange={(v: string) => setParams({ ...params, witnesses: v })} placeholder="Names and contact info of witnesses..." />
              </div>
            </>
          ) : params.type === 'Job Hazard Analysis (JHA)' ? (
            <>
              <div className="md:col-span-2">
                <TextArea label="Task / Activity" value={params.taskActivity} onChange={(v: string) => setParams({ ...params, taskActivity: v })} placeholder="Describe the work being done..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Hazards Identified" value={params.hazards} onChange={(v: string) => setParams({ ...params, hazards: v })} placeholder="List potential risks..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Existing Controls" value={params.existingControls} onChange={(v: string) => setParams({ ...params, existingControls: v })} placeholder="Controls currently in place..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Proposed Controls" value={params.proposedControls} onChange={(v: string) => setParams({ ...params, proposedControls: v })} placeholder="Additional controls needed..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Required PPE" value={params.ppe} onChange={(v: string) => setParams({ ...params, ppe: v })} placeholder="e.g. Hard hat, safety boots, high-vis vest..." />
              </div>
            </>
          ) : (
            <>
              <div className="md:col-span-2">
                <TextArea label="Task / Activity" value={params.taskActivity} onChange={(v: string) => setParams({ ...params, taskActivity: v })} placeholder="Describe the work being done..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Hazards Identified" value={params.hazards} onChange={(v: string) => setParams({ ...params, hazards: v })} placeholder="List potential risks..." />
              </div>
              <div className="md:col-span-2">
                <TextArea label="Required PPE" value={params.ppe} onChange={(v: string) => setParams({ ...params, ppe: v })} placeholder="e.g. Hard hat, safety boots, high-vis vest..." />
              </div>
            </>
          )}
          <div className="md:col-span-2 pt-4 border-t border-zinc-100">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">Update Existing Document (Optional)</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Existing Document Content</label>
                {!params.existingDocument ? (
                  <DocumentUploader id="qhse-upload" onUpload={(text) => setParams({ ...params, existingDocument: text })} />
                ) : (
                  <div className="space-y-2">
                    <TextArea value={params.existingDocument} onChange={(v: string) => setParams({ ...params, existingDocument: v })} placeholder="Extracted content will appear here..." />
                    <Button variant="outline" className="text-xs py-1 px-3" onClick={() => setParams({ ...params, existingDocument: '' })}>Clear Document</Button>
                  </div>
                )}
              </div>
              <TextArea label="Update Instructions" value={params.updateInstructions} onChange={(v: string) => setParams({ ...params, updateInstructions: v })} placeholder="e.g. Update the hazards to include working near water..." />
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            {params.existingDocument ? `Update Professional ${params.type}` : `Generate Professional ${params.type}`}
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
    supervisorName: '',
    existingDocument: '',
    updateInstructions: ''
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
          <div className="md:col-span-2 pt-4 border-t border-zinc-100">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">Update Existing Document (Optional)</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Existing SOP Content</label>
                {!params.existingDocument ? (
                  <DocumentUploader id="sop-upload" onUpload={(text) => setParams({ ...params, existingDocument: text })} />
                ) : (
                  <div className="space-y-2">
                    <TextArea value={params.existingDocument} onChange={(v: string) => setParams({ ...params, existingDocument: v })} placeholder="Extracted content will appear here..." />
                    <Button variant="outline" className="text-xs py-1 px-3" onClick={() => setParams({ ...params, existingDocument: '' })}>Clear Document</Button>
                  </div>
                )}
              </div>
              <TextArea label="Update Instructions" value={params.updateInstructions} onChange={(v: string) => setParams({ ...params, updateInstructions: v })} placeholder="e.g. Update the SOP to include new safety guidelines for the crane..." />
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            {params.existingDocument ? 'Update Professional SOP' : 'Generate Professional SOP'}
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
  const [params, setParams] = useState({ topic: '', level: 'BSc', formatStyle: 'APA' });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">School Project Write-up</h2>
      <Card className="p-8">
        <div className="space-y-6">
          <Input label="Project Topic" value={params.topic} onChange={(v: string) => setParams({ ...params, topic: v })} placeholder="e.g. Impact of HSE Management on Construction Productivity" />
          
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
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

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-zinc-700">Format Style</label>
              <select 
                value={params.formatStyle} 
                onChange={(e) => setParams({ ...params, formatStyle: e.target.value })}
                className="w-full px-3 py-3 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900"
              >
                <option value="APA">APA (American Psychological Association)</option>
                <option value="MLA">MLA (Modern Language Association)</option>
                <option value="Harvard">Harvard Referencing</option>
                <option value="Chicago">Chicago Manual of Style</option>
              </select>
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

const PresentationGenerator = ({ onGenerate, loading }: any) => {
  const [params, setParams] = useState({
    topic: '',
    audience: '',
    numSlides: '10',
    keyPoints: '',
    formatStyle: 'Professional',
    existingDocument: '',
    updateInstructions: ''
  });

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6">
      <div className="flex justify-between items-center">
        <h2 className="text-3xl font-bold text-zinc-900">Presentation Generator</h2>
      </div>
      <Card className="p-8">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="md:col-span-2">
            <Input label="Topic / Title" value={params.topic} onChange={(v: string) => setParams({ ...params, topic: v })} placeholder="e.g. Q3 Financial Results" />
          </div>
          <Input label="Target Audience" value={params.audience} onChange={(v: string) => setParams({ ...params, audience: v })} placeholder="e.g. Board of Directors, General Public" />
          <Input label="Number of Slides" type="number" value={params.numSlides} onChange={(v: string) => setParams({ ...params, numSlides: v })} placeholder="e.g. 10" />
          
          <div className="space-y-1.5 md:col-span-2">
            <label className="text-sm font-medium text-zinc-700">Format Style</label>
            <select 
              value={params.formatStyle} 
              onChange={(e) => setParams({ ...params, formatStyle: e.target.value })}
              className="w-full px-3 py-2 bg-white border border-zinc-200 rounded-lg focus:outline-none focus:ring-2 focus:ring-emerald-500/20 focus:border-emerald-500 transition-all text-zinc-900"
            >
              <option value="Professional">Professional</option>
              <option value="Creative / Pitch">Creative / Pitch</option>
              <option value="Educational / Training">Educational / Training</option>
              <option value="Minimalist">Minimalist</option>
            </select>
          </div>

          <div className="md:col-span-2">
            <TextArea label="Key Points to Cover" value={params.keyPoints} onChange={(v: string) => setParams({ ...params, keyPoints: v })} placeholder="List the main points or outline..." />
          </div>

          <div className="md:col-span-2 pt-4 border-t border-zinc-100">
            <h3 className="text-lg font-semibold text-zinc-800 mb-4">Redo Existing Presentation (Optional)</h3>
            <div className="space-y-6">
              <div className="space-y-2">
                <label className="text-sm font-medium text-zinc-700">Upload Existing Presentation or Document</label>
                {!params.existingDocument ? (
                  <DocumentUploader id="presentation-upload" onUpload={(text) => setParams({ ...params, existingDocument: text })} />
                ) : (
                  <div className="space-y-2">
                    <TextArea value={params.existingDocument} onChange={(v: string) => setParams({ ...params, existingDocument: v })} placeholder="Extracted content will appear here..." />
                    <Button variant="outline" className="text-xs py-1 px-3" onClick={() => setParams({ ...params, existingDocument: '' })}>Clear Document</Button>
                  </div>
                )}
              </div>
              <TextArea label="Redesign Instructions" value={params.updateInstructions} onChange={(v: string) => setParams({ ...params, updateInstructions: v })} placeholder="e.g. Make it more professional, summarize the content into 10 slides..." />
            </div>
          </div>
        </div>
        <div className="mt-8 pt-8 border-t border-zinc-100">
          <Button className="w-full py-4 text-lg" loading={loading} onClick={() => onGenerate(params)}>
            Generate Presentation
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const AdminDashboard = ({ users, docs, onUpdateUser }: any) => {
  const [view, setView] = useState<'users' | 'docs'>('users');

  const availablePermissions = ['QHSE', 'SOP', 'Project', 'Toolbox', 'Permit', 'Presentation', 'Conversion'];

  const togglePermission = (user: UserProfile, perm: string) => {
    const current = user.permissions || [];
    const updated = current.includes(perm) 
      ? current.filter(p => p !== perm)
      : [...current, perm];
    onUpdateUser(user.uid, { permissions: updated });
  };

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
                <th className="p-4 font-semibold text-zinc-600">Permissions</th>
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
                    <div className="flex flex-wrap gap-1">
                      {availablePermissions.map(perm => (
                        <button
                          key={perm}
                          onClick={() => togglePermission(u, perm)}
                          className={cn(
                            "px-2 py-1 rounded text-xs border transition-colors",
                            (u.permissions || []).includes(perm) || u.role === 'admin'
                              ? "bg-emerald-50 border-emerald-200 text-emerald-700"
                              : "bg-zinc-50 border-zinc-200 text-zinc-400 hover:border-zinc-300"
                          )}
                          disabled={u.role === 'admin'}
                          title={u.role === 'admin' ? "Admins have all permissions" : `Toggle ${perm}`}
                        >
                          {perm}
                        </button>
                      ))}
                    </div>
                  </td>
                  <td className="p-4">
                    <select 
                      value={u.role} 
                      onChange={(e) => onUpdateUser(u.uid, { role: e.target.value })}
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
      if (file.type === 'application/pdf') {
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
      } else if (file.type === 'application/vnd.openxmlformats-officedocument.wordprocessingml.document' || file.name.endsWith('.docx')) {
        const arrayBuffer = await file.arrayBuffer();
        const result = await mammoth.extractRawText({ arrayBuffer });
        onExtracted(result.value);
      } else {
        alert("Unsupported file format. Please upload a PDF or DOCX file.");
      }
    } catch (err) {
      console.error(err);
      alert("Failed to process document.");
    } finally {
      setLoading(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0 }} animate={{ opacity: 1 }} className="space-y-6">
      <h2 className="text-3xl font-bold text-zinc-900">Document to Word & Editor</h2>
      <Card className="p-12 text-center border-dashed border-2 border-zinc-200 bg-zinc-50/50">
        <div className="max-w-sm mx-auto space-y-4">
          <div className="w-16 h-16 bg-white rounded-2xl flex items-center justify-center mx-auto shadow-sm">
            {loading ? <Loader2 className="w-8 h-8 text-emerald-600 animate-spin" /> : <FileUp className="w-8 h-8 text-emerald-600" />}
          </div>
          <div>
            <h3 className="font-bold text-lg text-zinc-900">Enhanced Document Processing</h3>
            <p className="text-zinc-500">Upload your PDF or Word document to extract text, maintain tables, and edit content with AI.</p>
          </div>
          <input type="file" className="hidden" id="pdf-upload" accept=".pdf,.docx" onChange={handleFileUpload} />
          <Button variant="secondary" className="w-full" loading={loading} onClick={() => document.getElementById('pdf-upload')?.click()}>
            Select Document File
          </Button>
        </div>
      </Card>
    </motion.div>
  );
};

const Editor = ({ docData, onSave, onRewrite, loading }: any) => {
  const [content, setContent] = useState(docData?.content || '');
  const [title, setTitle] = useState(docData?.title || 'New Document');
  const [instruction, setInstruction] = useState('');
  const [view, setView] = useState<'edit' | 'preview'>('edit');
  const [showVersions, setShowVersions] = useState(false);
  const [versions, setVersions] = useState<any[]>([]);
  const [loadingVersions, setLoadingVersions] = useState(false);
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setContent(docData?.content || '');
    setTitle(docData?.title || 'New Document');
  }, [docData]);

  const handleCopy = async () => {
    try {
      await navigator.clipboard.writeText(content);
      setCopied(true);
      setTimeout(() => setCopied(false), 2000);
    } catch (err) {
      console.error('Failed to copy text', err);
    }
  };

  const loadVersions = async () => {
    if (!docData?.id) return;
    setLoadingVersions(true);
    setShowVersions(true);
    try {
      const q = query(collection(db, 'documents', docData.id, 'versions'), orderBy('createdAt', 'desc'));
      const snapshot = await getDocs(q);
      const v = snapshot.docs.map(d => ({ id: d.id, ...d.data() }));
      setVersions(v);
    } catch (err) {
      handleFirestoreError(err, OperationType.LIST, `documents/${docData.id}/versions`);
      console.error(err);
    } finally {
      setLoadingVersions(false);
    }
  };

  return (
    <motion.div initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} className="space-y-6 relative">
      <div className="flex justify-between items-center">
        <div className="flex-1 mr-4">
          <input 
            value={title} 
            onChange={(e) => setTitle(e.target.value)}
            className="text-3xl font-bold text-zinc-900 bg-transparent border-none focus:ring-0 w-full"
          />
        </div>
        <div className="flex gap-2">
          <Button variant="outline" onClick={handleCopy}>
            {copied ? <CheckCircle2 className="w-4 h-4 mr-2 text-emerald-600" /> : <Copy className="w-4 h-4 mr-2" />}
            {copied ? 'Copied!' : 'Copy Text'}
          </Button>
          <Button variant="outline" onClick={() => downloadAsWord(content, title)}>
            <Download className="w-4 h-4 mr-2" /> Word
          </Button>
          {docData?.id && (
            <Button variant="outline" onClick={loadVersions}>
              <History className="w-4 h-4 mr-2" /> Versions
            </Button>
          )}
          <Button variant="outline" onClick={() => setView(view === 'edit' ? 'preview' : 'edit')}>
            {view === 'edit' ? 'Preview' : 'Edit'}
          </Button>
          <Button onClick={() => onSave(title, content)}>Save Document</Button>
        </div>
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-4 gap-8">
        <div className="lg:col-span-3">
          <Card className="min-h-[600px] flex flex-col relative overflow-hidden">
            {showVersions ? (
              <div className="absolute inset-0 bg-white z-10 p-6 overflow-y-auto flex flex-col">
                <div className="flex justify-between items-center mb-6">
                  <h3 className="text-xl font-bold">Version History</h3>
                  <Button variant="ghost" onClick={() => setShowVersions(false)}><X className="w-5 h-5" /></Button>
                </div>
                {loadingVersions ? (
                  <div className="flex-1 flex items-center justify-center"><Loader2 className="w-8 h-8 animate-spin text-emerald-600" /></div>
                ) : (
                  <div className="space-y-4">
                    {versions.map((v, i) => (
                      <Card key={v.id} className="p-4 flex justify-between items-center bg-zinc-50">
                        <div>
                          <p className="font-semibold text-zinc-900">Version {versions.length - i}</p>
                          <p className="text-sm text-zinc-500">
                            {v.createdAt?.toDate ? v.createdAt.toDate().toLocaleString() : 'Just now'}
                          </p>
                        </div>
                        <div className="flex gap-2">
                          <Button variant="outline" onClick={() => {
                            setContent(v.content);
                            setShowVersions(false);
                          }}>Restore</Button>
                        </div>
                      </Card>
                    ))}
                    {versions.length === 0 && <p className="text-zinc-500">No versions found.</p>}
                  </div>
                )}
              </div>
            ) : null}

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
