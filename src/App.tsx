import React, { useState, useEffect, useMemo, Component, ErrorInfo, ReactNode } from 'react';
import { 
  collection, 
  onSnapshot, 
  addDoc, 
  updateDoc, 
  setDoc,
  deleteDoc, 
  doc, 
  query, 
  orderBy, 
  limit,
  serverTimestamp,
  getDocFromServer,
  getDocsFromServer,
  getDocs,
  writeBatch
} from 'firebase/firestore';
import { 
  signInWithPopup, 
  GoogleAuthProvider, 
  onAuthStateChanged, 
  signOut,
  User
} from 'firebase/auth';
import { db, auth } from './firebase';
import { InventoryItem, Product, Sale, Settings, StockMovement, ProductRecipe, RecipeIngredient, Employee, Attendance, UserProfile } from './types';
import * as XLSX from 'xlsx';
import { 
  LayoutDashboard, 
  Package, 
  ShoppingCart, 
  Settings as SettingsIcon, 
  Plus, 
  Minus,
  Trash2, 
  AlertTriangle,
  TrendingUp,
  DollarSign,
  LogOut,
  Coffee,
  FileDown,
  FileUp,
  ClipboardList,
  Users,
  Clock,
  Calendar,
  MapPin,
  Wifi,
  ShieldCheck,
  Save,
  RefreshCw,
  Target,
  Database
} from 'lucide-react';
import { 
  LineChart, 
  Line, 
  XAxis, 
  YAxis, 
  CartesianGrid, 
  Tooltip, 
  ResponsiveContainer,
  BarChart,
  Bar
} from 'recharts';
import { format, startOfDay, endOfDay, subDays, isWithinInterval, parseISO, parse, isValid, isToday, isBefore } from 'date-fns';
import { cn } from './lib/utils';

const safeDateFormat = (dateVal: any, formatStr: string = 'dd/MM/yyyy') => {
  if (!dateVal) return 'N/A';
  try {
    let date: Date;
    if (dateVal instanceof Date) {
      date = dateVal;
    } else if (typeof dateVal === 'string') {
      const trimmed = dateVal.trim();
      date = parseISO(trimmed);
      if (!isValid(date)) {
        const formats = ['yyyy-MM-dd', 'dd/MM/yyyy', 'dd-MM-yyyy', 'yyyy/MM/dd', 'yyyy.MM.dd'];
        for (const f of formats) {
          const p = parse(trimmed, f, new Date());
          if (isValid(p)) {
            date = p;
            break;
          }
        }
      }
    } else if (dateVal && typeof dateVal.toDate === 'function') {
      date = dateVal.toDate();
    } else if (typeof dateVal === 'number') {
      date = new Date(dateVal);
    } else {
      return 'N/A';
    }
    
    if (!isValid(date)) return 'N/A';
    return format(date, formatStr);
  } catch (e) {
    console.error("Date formatting error:", e, dateVal);
    return 'N/A';
  }
};

const safeParseDate = (dateVal: any): Date => {
  if (!dateVal) return new Date();
  try {
    if (dateVal instanceof Date) return dateVal;
    if (typeof dateVal === 'string') return parseISO(dateVal);
    if (dateVal && typeof dateVal.toDate === 'function') return dateVal.toDate();
    if (typeof dateVal === 'number') return new Date(dateVal);
    return new Date();
  } catch (e) {
    return new Date();
  }
};

function calculateDistance(lat1: number, lon1: number, lat2: number, lon2: number) {
  const R = 6371e3; // meters
  const φ1 = lat1 * Math.PI / 180;
  const φ2 = lat2 * Math.PI / 180;
  const Δφ = (lat2 - lat1) * Math.PI / 180;
  const Δλ = (lon2 - lon1) * Math.PI / 180;

  const a = Math.sin(Δφ / 2) * Math.sin(Δφ / 2) +
          Math.cos(φ1) * Math.cos(φ2) *
          Math.sin(Δλ / 2) * Math.sin(Δλ / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return R * c; // in meters
}

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

interface ErrorBoundaryProps {
  children: ReactNode;
}

interface ErrorBoundaryState {
  hasError: boolean;
  error: Error | null;
}

class ErrorBoundary extends Component<ErrorBoundaryProps, ErrorBoundaryState> {
  constructor(props: ErrorBoundaryProps) {
    super(props);
    this.state = { hasError: false, error: null };
  }

  static getDerivedStateFromError(error: Error): ErrorBoundaryState {
    return { hasError: true, error };
  }

  componentDidCatch(error: Error, errorInfo: ErrorInfo) {
    console.error("ErrorBoundary caught an error", error, errorInfo);
  }

  render() {
    if (this.state.hasError) {
      let message = "Đã có lỗi xảy ra. Vui lòng thử lại sau.";
      let details = "";
      try {
        const parsed = JSON.parse(this.state.error?.message || "");
        if (parsed.error && (parsed.error.includes("permission-denied") || parsed.error.includes("insufficient permissions"))) {
          message = "Bạn không có quyền thực hiện thao tác này hoặc truy cập dữ liệu này.";
          details = `Path: ${parsed.path}, Op: ${parsed.operationType}`;
        } else {
          details = parsed.error || String(this.state.error?.message);
        }
      } catch (e) {
        details = this.state.error?.message || "Lỗi không xác định";
      }

      return (
        <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0] p-4">
          <div className="max-w-md w-full bg-white rounded-3xl p-8 shadow-xl text-center">
            <div className="w-16 h-16 bg-red-100 rounded-full flex items-center justify-center mx-auto mb-4">
              <AlertTriangle className="text-red-600 w-8 h-8" />
            </div>
            <h2 className="text-xl font-bold text-gray-900 mb-2">Lỗi hệ thống</h2>
            <p className="text-gray-600 mb-2">{message}</p>
            {details && <p className="text-xs text-red-400 mb-6 font-mono break-all">{details}</p>}
            <button 
              onClick={() => window.location.reload()}
              className="w-full bg-[#5A5A40] text-white py-3 rounded-xl font-medium"
            >
              Tải lại trang
            </button>
          </div>
        </div>
      );
    }
    return this.props.children;
  }
}

const provider = new GoogleAuthProvider();

export default function App() {
  return (
    <ErrorBoundary>
      <AppContent />
    </ErrorBoundary>
  );
}

function AppContent() {
  const [user, setUser] = useState<User | null>(null);
  const [userProfile, setUserProfile] = useState<UserProfile | null>(null);
  const [loading, setLoading] = useState(true);
  const [activeTab, setActiveTab] = useState<'dashboard' | 'inventory' | 'stockin' | 'stockout' | 'sales' | 'products' | 'recipes' | 'timekeeping' | 'settings'>('dashboard');
  
  const [inventory, setInventory] = useState<InventoryItem[]>([]);
  const [products, setProducts] = useState<Product[]>([]);
  const [sales, setSales] = useState<Sale[]>([]);
  const [movements, setMovements] = useState<StockMovement[]>([]);
  const [recipes, setRecipes] = useState<ProductRecipe[]>([]);
  const [employees, setEmployees] = useState<Employee[]>([]);
  const [attendance, setAttendance] = useState<Attendance[]>([]);
  const [users, setUsers] = useState<UserProfile[]>([]);
  const [settings, setSettings] = useState<Settings>({ adminEmails: [] });

  const isAdmin = userProfile?.role === 'admin' || (user?.email && (user.email === 'huynhtin86@gmail.com' || settings.adminEmails?.includes(user.email)));

  // Auth Listener
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, async (u) => {
      setUser(u);
      if (u) {
        // Fetch or create user profile
        const userRef = doc(db, 'users', u.uid);
        const userSnap = await getDocFromServer(userRef);
        
        if (userSnap.exists()) {
          setUserProfile(userSnap.data() as UserProfile);
        } else {
          // Fetch settings to check admin emails
          let adminEmails: string[] = [];
          try {
            const settingsSnap = await getDocFromServer(doc(db, 'settings', 'global'));
            if (settingsSnap.exists()) {
              adminEmails = (settingsSnap.data() as Settings).adminEmails || [];
            }
          } catch (e) {
            console.error("Error fetching settings for role check:", e);
          }
          
          // Default role logic
          const defaultRole = (u.email === 'huynhtin86@gmail.com' || (u.email && adminEmails.includes(u.email))) ? 'admin' : 'staff';
          const newProfile: UserProfile = {
            uid: u.uid,
            email: u.email || '',
            role: defaultRole,
            displayName: u.displayName || ''
          };
          await setDoc(userRef, newProfile);
          setUserProfile(newProfile);
        }
      } else {
        setUserProfile(null);
      }
      setLoading(false);
    });
    return () => unsubscribe();
  }, []);

  // Set default tab based on role
  useEffect(() => {
    if (userProfile || user) {
      if (!isAdmin) {
        setActiveTab('timekeeping');
      } else {
        setActiveTab('dashboard');
      }
    }
  }, [userProfile, user, isAdmin]);

  // Firestore Listeners
  useEffect(() => {
    if (!user) return;

    // Admin-only listeners
    let unsubInventory = () => {};
    let unsubProducts = () => {};
    let unsubSales = () => {};
    let unsubMovements = () => {};
    let unsubSettings = () => {};
    let unsubRecipes = () => {};
    let unsubEmployees = () => {};
    let unsubAttendance = () => {};
    let unsubUsers = () => {};

    if (isAdmin) {
      unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
        setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'inventory');
      });

      unsubProducts = onSnapshot(collection(db, 'products'), (snapshot) => {
        setProducts(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Product)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'products');
      });

      unsubSales = onSnapshot(query(collection(db, 'sales'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
        setSales(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Sale)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'sales');
      });

      unsubMovements = onSnapshot(query(collection(db, 'movements'), orderBy('timestamp', 'desc'), limit(100)), (snapshot) => {
        setMovements(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as StockMovement)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'movements');
      });

      unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
        if (doc.exists()) {
          setSettings(doc.data() as Settings);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      });

      unsubRecipes = onSnapshot(collection(db, 'recipes'), (snapshot) => {
        setRecipes(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as ProductRecipe)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'recipes');
      });

      unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
        setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'employees');
      });

      unsubAttendance = onSnapshot(query(collection(db, 'attendance'), orderBy('clockIn', 'desc'), limit(500)), (snapshot) => {
        setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'attendance');
      });

      unsubUsers = onSnapshot(collection(db, 'users'), (snapshot) => {
        setUsers(snapshot.docs.map(doc => ({ uid: doc.id, ...doc.data() } as UserProfile)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'users');
      });
    } else {
      // Staff-only listeners (subset)
      unsubInventory = onSnapshot(collection(db, 'inventory'), (snapshot) => {
        setInventory(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as InventoryItem)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'inventory');
      });

      unsubEmployees = onSnapshot(collection(db, 'employees'), (snapshot) => {
        setEmployees(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Employee)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'employees');
      });

      unsubAttendance = onSnapshot(query(collection(db, 'attendance'), orderBy('clockIn', 'desc'), limit(100)), (snapshot) => {
        setAttendance(snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() } as Attendance)));
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'attendance');
      });

      unsubSettings = onSnapshot(doc(db, 'settings', 'global'), (doc) => {
        if (doc.exists()) {
          setSettings(doc.data() as Settings);
        }
      }, (error) => {
        handleFirestoreError(error, OperationType.GET, 'settings/global');
      });
    }

    return () => {
      unsubInventory();
      unsubProducts();
      unsubSales();
      unsubMovements();
      unsubSettings();
      unsubRecipes();
      unsubEmployees();
      unsubAttendance();
      unsubUsers();
    };
  }, [user, isAdmin]);

  // Connection Test
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

  const handleLogin = () => signInWithPopup(auth, provider);
  const handleLogout = () => signOut(auth);

  if (loading) {
    return (
      <div className="min-h-screen flex items-center justify-center bg-[#f5f5f0]">
        <div className="animate-spin rounded-full h-12 w-12 border-t-2 border-b-2 border-[#5A5A40]"></div>
      </div>
    );
  }

  if (!user) {
    return (
      <div className="min-h-screen bg-[#050505] flex flex-col items-center justify-center p-6 overflow-hidden relative">
        {/* Background Atmosphere */}
        <div className="absolute inset-0 overflow-hidden pointer-events-none">
          <div className="absolute top-[-10%] left-[-10%] w-[40%] h-[40%] bg-[#5A5A40] opacity-20 blur-[120px] rounded-full" />
          <div className="absolute bottom-[-10%] right-[-10%] w-[40%] h-[40%] bg-[#5A5A40] opacity-10 blur-[120px] rounded-full" />
        </div>

        <div className="max-w-4xl w-full grid grid-cols-1 lg:grid-cols-2 gap-12 items-center relative z-10">
          <div className="space-y-8 text-center lg:text-left">
            <div className="inline-flex items-center gap-3 px-4 py-2 bg-white/5 border border-white/10 rounded-full backdrop-blur-sm">
              <Coffee className="w-5 h-5 text-[#5A5A40]" />
              <span className="text-xs font-semibold tracking-widest uppercase text-white/70">Laboong Manager v2.0</span>
            </div>
            
            <div className="space-y-4">
              <h1 className="text-6xl lg:text-8xl font-serif font-bold text-white leading-tight tracking-tighter">
                Quản lý <br />
                <span className="italic text-[#5A5A40]">Thông minh.</span>
              </h1>
              <p className="text-lg text-white/50 max-w-md mx-auto lg:mx-0 font-light leading-relaxed">
                Giải pháp quản trị tồn kho và nhân sự chuyên biệt cho quán trà sữa Laboong. 
                Tối ưu hóa quy trình, kiểm soát thất thoát.
              </p>
            </div>
          </div>

          <div className="bg-white/5 border border-white/10 p-8 lg:p-12 rounded-[40px] backdrop-blur-xl shadow-2xl space-y-8">
            <div className="space-y-2 text-center">
              <h2 className="text-2xl font-bold text-white">Bắt đầu phiên làm việc</h2>
              <p className="text-sm text-white/40">Vui lòng đăng nhập bằng tài khoản Google của bạn</p>
            </div>

            <div className="space-y-4">
              <button 
                onClick={handleLogin}
                className="w-full group relative flex items-center justify-center gap-4 bg-white text-black py-5 rounded-2xl font-bold hover:bg-[#5A5A40] hover:text-white transition-all duration-500 overflow-hidden"
              >
                <div className="absolute inset-0 bg-gradient-to-r from-transparent via-white/20 to-transparent translate-x-[-100%] group-hover:translate-x-[100%] transition-transform duration-1000" />
                <svg className="w-6 h-6" viewBox="0 0 24 24">
                  <path fill="currentColor" d="M22.56 12.25c0-.78-.07-1.53-.2-2.25H12v4.26h5.92c-.26 1.37-1.04 2.53-2.21 3.31v2.77h3.57c2.08-1.92 3.28-4.74 3.28-8.09z" />
                  <path fill="currentColor" d="M12 23c2.97 0 5.46-.98 7.28-2.66l-3.57-2.77c-.98.66-2.23 1.06-3.71 1.06-2.86 0-5.29-1.93-6.16-4.53H2.18v2.84C3.99 20.53 7.7 23 12 23z" />
                  <path fill="currentColor" d="M5.84 14.09c-.22-.66-.35-1.36-.35-2.09s.13-1.43.35-2.09V7.07H2.18C1.43 8.55 1 10.22 1 12s.43 3.45 1.18 4.93l3.66-2.84z" />
                  <path fill="currentColor" d="M12 5.38c1.62 0 3.06.56 4.21 1.64l3.15-3.15C17.45 2.09 14.97 1 12 1 7.7 1 3.99 3.47 2.18 7.07l3.66 2.84c.87-2.6 3.3-4.53 6.16-4.53z" />
                </svg>
                Tiếp tục với Google
              </button>

              <div className="flex items-center gap-4 py-4">
                <div className="h-px flex-1 bg-white/10" />
                <span className="text-[10px] uppercase tracking-[0.2em] text-white/20 font-bold">Phân quyền truy cập</span>
                <div className="h-px flex-1 bg-white/10" />
              </div>

              <div className="grid grid-cols-2 gap-4">
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center space-y-1">
                  <ShieldCheck className="w-5 h-5 text-[#5A5A40] mx-auto mb-2" />
                  <p className="text-xs font-bold text-white">Quản trị</p>
                  <p className="text-[10px] text-white/30">Toàn quyền hệ thống</p>
                </div>
                <div className="p-4 rounded-2xl bg-white/5 border border-white/5 text-center space-y-1">
                  <Users className="w-5 h-5 text-[#5A5A40] mx-auto mb-2" />
                  <p className="text-xs font-bold text-white">Nhân viên</p>
                  <p className="text-[10px] text-white/30">Chấm công & Xuất kho</p>
                </div>
              </div>
            </div>
          </div>
        </div>

        <div className="absolute bottom-8 left-8 right-8 flex justify-between items-center text-[10px] uppercase tracking-widest text-white/20 font-bold">
          <p>© 2026 Laboong Tea & Coffee</p>
          <div className="flex gap-6">
            <a href="#" className="hover:text-white transition-colors">Điều khoản</a>
            <a href="#" className="hover:text-white transition-colors">Bảo mật</a>
          </div>
        </div>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-[#f5f5f0] flex flex-col md:flex-row">
      {/* Sidebar */}
      <aside className="w-full md:w-64 bg-[#151619] text-white p-6 flex flex-col">
        <div className="flex items-center gap-3 mb-10 px-2">
          <div className="p-2 bg-[#5A5A40] rounded-lg">
            <Coffee className="w-6 h-6" />
          </div>
          <span className="font-serif font-bold text-xl">Laboong Manager</span>
        </div>

        <nav className="flex-1 space-y-2">
          {isAdmin && (
            <>
              <NavItem 
                active={activeTab === 'dashboard'} 
                onClick={() => setActiveTab('dashboard')} 
                icon={<LayoutDashboard className="w-5 h-5" />} 
                label="Tổng quan" 
              />
              <NavItem 
                active={activeTab === 'inventory'} 
                onClick={() => setActiveTab('inventory')} 
                icon={<Package className="w-5 h-5" />} 
                label="Tồn kho" 
              />
              <NavItem 
                active={activeTab === 'stockin'} 
                onClick={() => setActiveTab('stockin')} 
                icon={<Plus className="w-5 h-5" />} 
                label="Nhập kho" 
              />
            </>
          )}
          <NavItem 
            active={activeTab === 'stockout'} 
            onClick={() => setActiveTab('stockout')} 
            icon={<Minus className="w-5 h-5" />} 
            label="Xuất kho" 
          />
          <NavItem 
            active={activeTab === 'timekeeping'} 
            onClick={() => setActiveTab('timekeeping')} 
            icon={<Clock className="w-5 h-5" />} 
            label="Chấm công" 
          />
          {isAdmin && (
            <NavItem 
              active={activeTab === 'settings'} 
              onClick={() => setActiveTab('settings')} 
              icon={<SettingsIcon className="w-5 h-5" />} 
              label="Cài đặt" 
            />
          )}
        </nav>

        <div className="mt-auto pt-6 border-t border-white/10">
          <div className="flex items-center gap-3 mb-4 px-2">
            <img src={user.photoURL || ''} className="w-8 h-8 rounded-full" alt="" referrerPolicy="no-referrer" />
            <div className="overflow-hidden">
              <p className="text-sm font-medium truncate">{user.displayName}</p>
              <p className="text-xs text-gray-400 truncate">{user.email}</p>
            </div>
          </div>
          <button 
            onClick={handleLogout}
            className="w-full flex items-center gap-3 px-4 py-2 text-gray-400 hover:text-white transition-colors"
          >
            <LogOut className="w-5 h-5" />
            <span className="text-sm">Đăng xuất</span>
          </button>
        </div>
      </aside>

      {/* Main Content */}
      <main className="flex-1 p-4 md:p-8 overflow-y-auto">
        {activeTab === 'dashboard' && isAdmin && <Dashboard inventory={inventory} movements={movements} />}
        {activeTab === 'inventory' && isAdmin && <Inventory inventory={inventory} user={user} />}
        {activeTab === 'stockin' && isAdmin && <StockIn inventory={inventory} user={user} />}
        {activeTab === 'stockout' && <StockOut inventory={inventory} user={user} />}
        {activeTab === 'sales' && isAdmin && <Sales sales={sales} products={products} user={user} />}
        {activeTab === 'products' && isAdmin && <Products products={products} />}
        {activeTab === 'recipes' && isAdmin && <Recipes recipes={recipes} products={products} inventory={inventory} />}
        {activeTab === 'timekeeping' && <Timekeeping employees={employees} attendance={attendance} user={user} settings={settings} isAdmin={isAdmin} />}
        {activeTab === 'settings' && isAdmin && <SettingsView settings={settings} users={users} />}
        
        {/* Unauthorized Access Message */}
        {!isAdmin && ['dashboard', 'inventory', 'stockin', 'sales', 'products', 'recipes', 'settings'].includes(activeTab) && (
          <div className="flex flex-col items-center justify-center h-full text-center">
            <AlertTriangle className="w-16 h-16 text-amber-500 mb-4" />
            <h2 className="text-2xl font-bold mb-2">Truy cập bị từ chối</h2>
            <p className="text-gray-500">Bạn không có quyền truy cập vào trang này. Vui lòng liên hệ quản trị viên.</p>
          </div>
        )}
      </main>
    </div>
  );
}

function NavItem({ active, onClick, icon, label }: { active: boolean, onClick: () => void, icon: React.ReactNode, label: string }) {
  return (
    <button 
      onClick={onClick}
      className={cn(
        "w-full flex items-center gap-3 px-4 py-3 rounded-xl transition-all duration-200",
        active ? "bg-[#5A5A40] text-white shadow-lg shadow-black/20" : "text-gray-400 hover:text-white hover:bg-white/5"
      )}
    >
      {icon}
      <span className="font-medium">{label}</span>
    </button>
  );
}

// --- Dashboard Component ---
function Dashboard({ inventory, movements }: { inventory: InventoryItem[], movements: StockMovement[] }) {
  const today = startOfDay(new Date());
  
  const lowStock = inventory.filter(item => item.quantity <= item.minThreshold);
  const expiredItems = inventory.filter(item => item.expiryDate && isBefore(safeParseDate(item.expiryDate), today));
  const totalInventoryValue = inventory.reduce((acc, item) => acc + (item.quantity * (item.purchasePrice || 0)), 0);
  
  const todayStockOut = movements.filter(m => m.type === 'out' && isToday(safeParseDate(m.timestamp)));
  const totalStockOutToday = todayStockOut.reduce((acc, m) => acc + m.quantity, 0);

  const recentStockOuts = movements.filter(m => m.type === 'out').slice(0, 10);

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Tổng quan</h2>
        <p className="text-gray-500">Chào mừng trở lại! Đây là tình hình kho bãi hôm nay.</p>
      </header>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-6">
        <StatCard 
          title="Xuất kho hôm nay" 
          value={totalStockOutToday.toLocaleString('vi-VN')} 
          icon={<LogOut className="text-orange-600 rotate-180" />}
          subtitle={`${todayStockOut.length} lượt xuất kho`}
        />
        <StatCard 
          title="Sản phẩm hết hạn" 
          value={expiredItems.length.toString()} 
          icon={<AlertTriangle className={expiredItems.length > 0 ? "text-red-600" : "text-gray-400"} />}
          subtitle={expiredItems.length > 0 ? `${expiredItems.length} mặt hàng đã hết hạn` : "Không có hàng hết hạn"}
        />
        <StatCard 
          title="Cảnh báo tồn kho" 
          value={lowStock.length.toString()} 
          icon={<AlertTriangle className={lowStock.length > 0 ? "text-amber-600" : "text-gray-400"} />}
          subtitle={lowStock.length > 0 ? `${lowStock.length} mặt hàng sắp hết` : "Mọi thứ đều ổn"}
        />
        <StatCard 
          title="Giá trị tồn kho" 
          value={totalInventoryValue.toLocaleString('vi-VN') + ' đ'} 
          icon={<Package className="text-blue-600" />}
          subtitle="Tổng giá trị nguyên liệu"
        />
      </div>

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
        {/* Expired Items List */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-red-600" />
            Sản phẩm đã hết hạn
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {expiredItems.length === 0 ? (
              <p className="text-gray-400 text-center py-10 italic">Không có sản phẩm nào hết hạn.</p>
            ) : (
              expiredItems.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-red-50 rounded-2xl border border-red-100">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-xs text-red-600">Hết hạn: {safeDateFormat(item.expiryDate)}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-red-700">{item.quantity} {item.unit}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>

        {/* Low Stock List */}
        <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
          <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-amber-600" />
            Cảnh báo số lượng tồn
          </h3>
          <div className="space-y-4 max-h-[400px] overflow-y-auto pr-2">
            {lowStock.length === 0 ? (
              <p className="text-gray-400 text-center py-10 italic">Tất cả mặt hàng đều đủ số lượng.</p>
            ) : (
              lowStock.map(item => (
                <div key={item.id} className="flex items-center justify-between p-4 bg-amber-50 rounded-2xl border border-amber-100">
                  <div>
                    <p className="font-bold text-gray-900">{item.name}</p>
                    <p className="text-xs text-amber-600">Định mức tối thiểu: {item.minThreshold} {item.unit}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-amber-700">{item.quantity} {item.unit}</p>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
        <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
          <LogOut className="w-5 h-5 text-orange-600 rotate-180" />
          Lịch sử xuất kho gần đây
        </h3>
        <div className="space-y-3">
          {recentStockOuts.map(movement => (
            <div key={movement.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
              <div className="flex items-center gap-4">
                <div className="p-2 rounded-lg bg-orange-100 text-orange-600">
                  <LogOut className="w-4 h-4 rotate-180" />
                </div>
                <div>
                  <p className="font-bold">{movement.itemName}</p>
                  <p className="text-xs text-gray-400">{safeDateFormat(movement.timestamp, 'HH:mm - dd/MM/yyyy')} - {movement.reason}</p>
                </div>
              </div>
              <div className="text-right">
                <p className="font-bold text-orange-600">
                  -{movement.quantity}
                </p>
              </div>
            </div>
          ))}
          {recentStockOuts.length === 0 && <p className="text-gray-400 text-center py-4 italic">Chưa có lịch sử xuất kho.</p>}
        </div>
      </div>
    </div>
  );
}

function StatCard({ title, value, icon, progress, target, subtitle }: { title: string, value: string, icon: React.ReactNode, progress?: number, target?: number, subtitle?: string }) {
  return (
    <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
      <div className="flex justify-between items-start mb-4">
        <p className="text-gray-500 font-medium">{title}</p>
        <div className="p-2 bg-gray-50 rounded-xl">{icon}</div>
      </div>
      <p className="text-2xl font-bold text-[#1a1a1a] mb-2">{value}</p>
      {progress !== undefined && (
        <div className="space-y-2">
          <div className="w-full bg-gray-100 h-2 rounded-full overflow-hidden">
            <div 
              className="bg-[#5A5A40] h-full transition-all duration-1000" 
              style={{ width: `${Math.min(progress, 100)}%` }}
            />
          </div>
          <p className="text-xs text-gray-400">
            Mục tiêu: {target?.toLocaleString('vi-VN')} đ ({Math.round(progress)}%)
          </p>
        </div>
      )}
      {subtitle && <p className="text-sm text-gray-400">{subtitle}</p>}
    </div>
  );
}

// --- Inventory Component ---
function Inventory({ inventory, user }: { inventory: InventoryItem[], user: User }) {
  const exportToExcel = () => {
    const data = inventory.map(item => ({
      'Tên mặt hàng': item.name,
      'Ngày hết hạn': safeDateFormat(item.expiryDate),
      'Đơn giá (VNĐ)': item.purchasePrice || 0,
      'Số lượng': item.quantity,
      'Đơn vị': item.unit,
      'Giá trị tồn kho (VNĐ)': (item.quantity * (item.purchasePrice || 0))
    }));

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Inventory");
    
    // Generate filename with current date
    const fileName = `Bao_cao_ton_kho_${format(new Date(), 'dd_MM_yyyy')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <header>
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Quản lý tồn kho</h2>
          <p className="text-gray-500">Theo dõi nguyên liệu và vật tư.</p>
        </header>
        <div className="flex gap-3">
          <button 
            onClick={exportToExcel}
            className="bg-white text-[#5A5A40] border border-[#5A5A40] px-6 py-3 rounded-2xl flex items-center gap-2 hover:bg-gray-50 transition-all"
          >
            <FileDown className="w-5 h-5" />
            Xuất Excel
          </button>
        </div>
      </div>

      <div className="bg-white rounded-3xl shadow-sm border border-black/5 overflow-hidden">
        <table className="w-full text-left">
          <thead className="bg-gray-50 border-bottom border-gray-100">
            <tr>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm">Tên nguyên liệu</th>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm">Số lượng</th>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm">Giá nhập</th>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm">Hạn dùng</th>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm">Trạng thái</th>
              <th className="px-6 py-4 font-serif italic text-gray-500 text-sm text-right">Thao tác</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {inventory.map(item => {
              const isExpired = item.expiryDate ? new Date(item.expiryDate) < new Date() : false;
              const isNearExpiry = item.expiryDate ? new Date(item.expiryDate) < subDays(new Date(), -7) : false;

              return (
                <tr key={item.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-4 font-bold text-[#1a1a1a]">{item.name}</td>
                  <td className="px-6 py-4">
                    <span className="font-mono">{item.quantity} {item.unit}</span>
                  </td>
                  <td className="px-6 py-4 text-sm text-gray-600">
                    {item.purchasePrice?.toLocaleString('vi-VN')} đ
                  </td>
                  <td className="px-6 py-4">
                    <span className={cn(
                      "text-sm",
                      isExpired ? "text-red-600 font-bold" : isNearExpiry ? "text-orange-500 font-medium" : "text-gray-600"
                    )}>
                      {safeDateFormat(item.expiryDate)}
                    </span>
                  </td>
                  <td className="px-6 py-4">
                    <div className="flex flex-col gap-1">
                      {item.quantity <= item.minThreshold && (
                        <span className="px-3 py-1 bg-red-100 text-red-700 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                          <AlertTriangle className="w-3 h-3" /> Sắp hết
                        </span>
                      )}
                      {isExpired ? (
                        <span className="px-3 py-1 bg-red-600 text-white rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                          Hết hạn
                        </span>
                      ) : isNearExpiry ? (
                        <span className="px-3 py-1 bg-orange-100 text-orange-700 rounded-full text-[10px] font-bold flex items-center gap-1 w-fit">
                          Sắp hết hạn
                        </span>
                      ) : item.quantity > item.minThreshold && (
                        <span className="px-3 py-1 bg-emerald-100 text-emerald-700 rounded-full text-[10px] font-bold w-fit">Ổn định</span>
                      )}
                    </div>
                  </td>
                  <td className="px-6 py-4 text-right">
                    <div className="flex items-center justify-end gap-3">
                      <button 
                        onClick={async () => {
                          if (!confirm('Bạn có chắc chắn muốn xóa nguyên liệu này?')) return;
                          try {
                            await deleteDoc(doc(db, 'inventory', item.id));
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `inventory/${item.id}`);
                          }
                        }}
                        className="text-gray-400 hover:text-red-500 transition-colors"
                      >
                        <Trash2 className="w-5 h-5" />
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </div>
  );
}

// --- StockOut Component ---
function StockOut({ inventory, user }: { inventory: InventoryItem[], user: User }) {
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [reason, setReason] = useState('Sử dụng pha chế');

  const handleStockOut = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;

    const item = inventory.find(i => i.id === selectedItemId);
    if (!item) return;

    if (quantity > item.quantity) {
      alert('Số lượng xuất kho không được lớn hơn số lượng tồn kho!');
      return;
    }

    try {
      await updateDoc(doc(db, 'inventory', selectedItemId), {
        quantity: item.quantity - quantity,
        lastUpdated: new Date().toISOString()
      });

      await addDoc(collection(db, 'movements'), {
        itemId: selectedItemId,
        itemName: item.name,
        quantity: quantity,
        type: 'out',
        reason: reason,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      setSelectedItemId('');
      setQuantity(0);
      setReason('Sử dụng pha chế');
      alert('Xuất kho thành công!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/movements');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Xuất kho nguyên liệu</h2>
        <p className="text-gray-500">Ghi nhận việc sử dụng hoặc hủy nguyên liệu.</p>
      </header>

      <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 max-w-2xl">
        <form onSubmit={handleStockOut} className="space-y-6">
          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-600">Chọn nguyên liệu</label>
            <select 
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              value={selectedItemId}
              onChange={e => setSelectedItemId(e.target.value)}
              required
            >
              <option value="">-- Chọn nguyên liệu --</option>
              {inventory.map(item => (
                <option key={item.id} value={item.id}>{item.name} (Hiện có: {item.quantity} {item.unit})</option>
              ))}
            </select>
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-600">Số lượng xuất</label>
            <input 
              type="number" 
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              value={quantity}
              onChange={e => setQuantity(Number(e.target.value))}
              required
            />
          </div>

          <div className="space-y-2">
            <label className="text-sm font-bold text-gray-600">Lý do xuất</label>
            <select 
              className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-orange-500/20"
              value={reason}
              onChange={e => setReason(e.target.value)}
              required
            >
              <option>Sử dụng pha chế</option>
              <option>Hỏng/Hết hạn</option>
              <option>Kiểm kê điều chỉnh</option>
              <option>Khác</option>
            </select>
          </div>

          <button type="submit" className="w-full bg-orange-600 text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-orange-700 transition-all">
            Xác nhận xuất kho
          </button>
        </form>
      </div>
    </div>
  );
}

// --- StockIn Component ---
function StockIn({ inventory, user }: { inventory: InventoryItem[], user: User }) {
  const [mode, setMode] = useState<'existing' | 'new' | 'import'>('existing');
  const [selectedItemId, setSelectedItemId] = useState('');
  const [quantity, setQuantity] = useState(0);
  const [purchasePrice, setPurchasePrice] = useState(0);
  const [expiryDate, setExpiryDate] = useState(format(new Date(), 'yyyy-MM-dd'));
  
  const [newItem, setNewItem] = useState({ name: '', quantity: 0, unit: 'kg', minThreshold: 5, purchasePrice: 0, expiryDate: format(new Date(), 'yyyy-MM-dd') });

  const [isImporting, setIsImporting] = useState(false);

  const handleImportExcel = async (e: React.ChangeEvent<HTMLInputElement>) => {
    const file = e.target.files?.[0];
    if (!file) return;

    setIsImporting(true);
    console.log("Starting Excel import for file:", file.name);
    const reader = new FileReader();
    reader.onload = async (evt) => {
      try {
        const data = evt.target?.result;
        if (!data) throw new Error("Không thể đọc dữ liệu từ file");
        
        const workbook = XLSX.read(data, { type: 'array', cellDates: true });
        const firstSheetName = workbook.SheetNames[0];
        const worksheet = workbook.Sheets[firstSheetName];
        const jsonData = XLSX.utils.sheet_to_json(worksheet, { defval: "" }) as any[];

        console.log("Parsed Excel data:", jsonData);

        if (jsonData.length === 0) {
          alert("File Excel không có dữ liệu hoặc sai định dạng.");
          setIsImporting(false);
          return;
        }

        let importedCount = 0;
        let skipCount = 0;
        let errors = [];

        const batchSize = 200; // 200 items = 400 operations (inventory + movements)
        for (let i = 0; i < jsonData.length; i += batchSize) {
          const batch = writeBatch(db);
          const chunk = jsonData.slice(i, i + batchSize);
          
          for (const row of chunk) {
            try {
              // Normalize keys to lowercase and remove spaces for easier matching
              const normalizedRow: any = {};
              Object.keys(row).forEach(key => {
                const normalizedKey = key.toLowerCase().trim().replace(/\s+/g, '');
                normalizedRow[normalizedKey] = row[key];
              });

              const name = (row['Tên nguyên liệu'] || row['Tên mặt hàng'] || row['name'] || normalizedRow['tennguyenlieu'] || normalizedRow['tenmathang'] || normalizedRow['name'] || "").toString().trim();
              
              if (!name) {
                skipCount++;
                continue;
              }

              const quantity = Number(row['Số lượng'] || row['quantity'] || normalizedRow['soluong'] || normalizedRow['quantity'] || 0);
              const unit = (row['Đơn vị'] || row['unit'] || normalizedRow['donvi'] || normalizedRow['unit'] || 'kg').toString();
              const purchasePrice = Number(row['Giá nhập'] || row['purchasePrice'] || normalizedRow['gianhap'] || normalizedRow['purchaseprice'] || 0);
              const minThreshold = Number(row['Ngưỡng cảnh báo'] || row['minThreshold'] || normalizedRow['nguongcanhbao'] || normalizedRow['minthreshold'] || 5);
              
              // Handle date parsing
              let rawExpiry = row['Hạn sử dụng'] || row['expiryDate'] || normalizedRow['hansudung'] || normalizedRow['expirydate'];
              let expiryDate = format(new Date(), 'yyyy-MM-dd');
              
              if (rawExpiry) {
                let parsedDate: Date | null = null;
                
                if (rawExpiry instanceof Date) {
                  parsedDate = rawExpiry;
                } else if (typeof rawExpiry === 'number') {
                  const excelDate = XLSX.SSF.parse_date_code(rawExpiry);
                  parsedDate = new Date(excelDate.y, excelDate.m - 1, excelDate.d);
                } else if (typeof rawExpiry === 'string' && rawExpiry.trim()) {
                  const dateStr = rawExpiry.trim();
                  const isoParsed = parseISO(dateStr);
                  if (isValid(isoParsed)) {
                    parsedDate = isoParsed;
                  } else {
                    const formats = ['yyyy-MM-dd', 'yyyy/MM/dd', 'dd-MM-yyyy', 'dd/MM/yyyy', 'yyyy.MM.dd'];
                    for (const f of formats) {
                      const p = parse(dateStr, f, new Date());
                      if (isValid(p)) {
                        parsedDate = p;
                        break;
                      }
                    }
                  }
                }
                
                if (parsedDate && isValid(parsedDate)) {
                  expiryDate = format(parsedDate, 'yyyy-MM-dd');
                }
              }

              const inventoryRef = doc(collection(db, 'inventory'));
              const movementRef = doc(collection(db, 'movements'));
              const now = new Date().toISOString();

              batch.set(inventoryRef, {
                name,
                quantity,
                unit,
                purchasePrice,
                minThreshold,
                expiryDate,
                lastUpdated: now
              });

              batch.set(movementRef, {
                itemId: inventoryRef.id,
                itemName: name,
                quantity: quantity,
                type: 'in',
                reason: 'Import từ Excel',
                timestamp: now,
                userId: user?.uid || 'unknown'
              });

              importedCount++;
            } catch (rowErr) {
              console.error("Error processing row:", row, rowErr);
              errors.push(rowErr instanceof Error ? rowErr.message : "Lỗi dòng dữ liệu");
            }
          }
          
          console.log(`Committing batch for items ${i} to ${i + chunk.length}...`);
          await batch.commit();
        }
        
        console.log(`Imported ${importedCount} items. Skipped ${skipCount}. Errors: ${errors.length}`);
        
        let msg = `Đã import thành công ${importedCount} mặt hàng!`;
        if (skipCount > 0) msg += `\nĐã bỏ qua ${skipCount} dòng không có tên.`;
        if (errors.length > 0) msg += `\nCó ${errors.length} dòng bị lỗi khi lưu.`;
        
        alert(msg);
        setMode('existing');
      } catch (error) {
        console.error("Excel import error:", error);
        // Don't call handleFirestoreError here to prevent crashing the app
        alert("Lỗi khi nhập dữ liệu: " + (error instanceof Error ? error.message : String(error)));
      } finally {
        setIsImporting(false);
        // Reset input
        e.target.value = '';
      }
    };
    reader.onerror = () => {
      alert("Lỗi khi đọc file.");
      setIsImporting(false);
    };
    reader.readAsArrayBuffer(file);
  };

  const handleStockInExisting = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!selectedItemId || quantity <= 0) return;

    const item = inventory.find(i => i.id === selectedItemId);
    if (!item) return;

    try {
      await updateDoc(doc(db, 'inventory', selectedItemId), {
        quantity: item.quantity + quantity,
        purchasePrice: purchasePrice || item.purchasePrice,
        expiryDate: expiryDate || item.expiryDate,
        lastUpdated: new Date().toISOString()
      });

      await addDoc(collection(db, 'movements'), {
        itemId: selectedItemId,
        itemName: item.name,
        quantity: quantity,
        type: 'in',
        reason: 'Nhập kho bổ sung',
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      setSelectedItemId('');
      setQuantity(0);
      setPurchasePrice(0);
      setExpiryDate(format(new Date(), 'yyyy-MM-dd'));
      alert('Nhập kho thành công!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/movements');
    }
  };

  const handleAddNewItem = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      const docRef = await addDoc(collection(db, 'inventory'), {
        ...newItem,
        lastUpdated: new Date().toISOString()
      });
      
      await addDoc(collection(db, 'movements'), {
        itemId: docRef.id,
        itemName: newItem.name,
        quantity: newItem.quantity,
        type: 'in',
        reason: 'Nhập kho mới',
        timestamp: new Date().toISOString(),
        userId: user.uid
      });

      setNewItem({ name: '', quantity: 0, unit: 'kg', minThreshold: 5, purchasePrice: 0, expiryDate: format(new Date(), 'yyyy-MM-dd') });
      alert('Thêm nguyên liệu mới thành công!');
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'inventory/movements');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Nhập kho nguyên liệu</h2>
        <p className="text-gray-500">Nhập thêm số lượng hoặc thêm nguyên liệu mới.</p>
      </header>

      <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-black/5 self-start w-fit">
        <button 
          onClick={() => setMode('existing')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            mode === 'existing' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          Nhập thêm hàng cũ
        </button>
        <button 
          onClick={() => setMode('new')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            mode === 'new' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          Thêm nguyên liệu mới
        </button>
        <button 
          onClick={() => setMode('import')}
          className={cn(
            "px-6 py-2 rounded-xl text-sm font-bold transition-all",
            mode === 'import' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
          )}
        >
          Import Excel
        </button>
      </div>

      {mode === 'existing' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 max-w-2xl">
          <form onSubmit={handleStockInExisting} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600">Chọn nguyên liệu</label>
              <select 
                className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                value={selectedItemId}
                onChange={e => {
                  const id = e.target.value;
                  setSelectedItemId(id);
                  const item = inventory.find(i => i.id === id);
                  if (item) {
                    setPurchasePrice(item.purchasePrice || 0);
                    setExpiryDate(item.expiryDate || format(new Date(), 'yyyy-MM-dd'));
                  }
                }}
                required
              >
                <option value="">-- Chọn nguyên liệu --</option>
                {inventory.map(item => (
                  <option key={item.id} value={item.id}>{item.name} (Hiện có: {item.quantity} {item.unit})</option>
                ))}
              </select>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Số lượng nhập thêm</label>
                <input 
                  type="number" 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                  value={quantity}
                  onChange={e => setQuantity(Number(e.target.value))}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Giá nhập mới (VNĐ)</label>
                <input 
                  type="number" 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                  value={purchasePrice}
                  onChange={e => setPurchasePrice(Number(e.target.value))}
                  required
                />
              </div>
            </div>

            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600">Hạn sử dụng mới</label>
              <input 
                type="date" 
                className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                value={expiryDate}
                onChange={e => setExpiryDate(e.target.value)}
                required
              />
            </div>

            <button type="submit" className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4a4a35] transition-all">
              Xác nhận nhập kho
            </button>
          </form>
        </div>
      ) : mode === 'new' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 max-w-2xl">
          <form onSubmit={handleAddNewItem} className="space-y-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600">Tên nguyên liệu</label>
              <input 
                type="text" 
                className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                value={newItem.name}
                onChange={e => setNewItem({...newItem, name: e.target.value})}
                required
              />
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Số lượng ban đầu</label>
                <div className="flex gap-2">
                  <input 
                    type="number" 
                    className="flex-1 p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                    value={newItem.quantity}
                    onChange={e => setNewItem({...newItem, quantity: Number(e.target.value)})}
                    required
                  />
                  <select 
                    className="w-24 p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                    value={newItem.unit}
                    onChange={e => setNewItem({...newItem, unit: e.target.value})}
                    required
                  >
                    <option value="kg">kg</option>
                    <option value="gram">gram</option>
                    <option value="Cái">Cái</option>
                    <option value="Chiếc">Chiếc</option>
                    <option value="Túi">Túi</option>
                    <option value="Gói">Gói</option>
                    <option value="Tập">Tập</option>
                    <option value="Tờ">Tờ</option>
                    <option value="Cuộn">Cuộn</option>
                    <option value="Bình">Bình</option>
                    <option value="Hộp">Hộp</option>
                  </select>
                </div>
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Giá nhập (VNĐ)</label>
                <input 
                  type="number" 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                  value={newItem.purchasePrice}
                  onChange={e => setNewItem({...newItem, purchasePrice: Number(e.target.value)})}
                  required
                />
              </div>
            </div>

            <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Ngưỡng cảnh báo</label>
                <input 
                  type="number" 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                  value={newItem.minThreshold}
                  onChange={e => setNewItem({...newItem, minThreshold: Number(e.target.value)})}
                  required
                />
              </div>
              <div className="space-y-2">
                <label className="text-sm font-bold text-gray-600">Hạn sử dụng</label>
                <input 
                  type="date" 
                  className="w-full p-4 rounded-2xl border border-gray-200 focus:outline-none focus:ring-2 focus:ring-[#5A5A40]/20"
                  value={newItem.expiryDate}
                  onChange={e => setNewItem({...newItem, expiryDate: e.target.value})}
                  required
                />
              </div>
            </div>

            <button type="submit" className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4a4a35] transition-all">
              Lưu nguyên liệu mới
            </button>
          </form>
        </div>
      ) : mode === 'import' ? (
        <div className="bg-white p-8 rounded-3xl shadow-sm border border-black/5 max-w-2xl">
          <div className="text-center space-y-6">
            <div className="w-20 h-20 bg-[#5A5A40]/10 rounded-full flex items-center justify-center mx-auto">
              <FileUp className="w-10 h-10 text-[#5A5A40]" />
            </div>
            <div>
              <h3 className="text-xl font-bold">Import từ Excel</h3>
              <p className="text-gray-500 mt-2">Tải lên file Excel chứa danh sách nguyên liệu của bạn.</p>
            </div>
            
            <div className="bg-gray-50 p-6 rounded-2xl text-left space-y-4">
              <p className="text-sm font-bold text-gray-700">Định dạng file yêu cầu (Tên cột):</p>
              <ul className="text-xs text-gray-500 space-y-1 list-disc ml-4">
                <li>Tên nguyên liệu (Bắt buộc)</li>
                <li>Số lượng</li>
                <li>Đơn vị (kg, gram, cái, túi, gói, bình)</li>
                <li>Giá nhập</li>
                <li>Ngưỡng cảnh báo</li>
                <li>Hạn sử dụng (YYYY-MM-DD)</li>
              </ul>
            </div>

            <div className="flex flex-col sm:flex-row gap-4">
              <button 
                onClick={() => {
                  const ws = XLSX.utils.json_to_sheet([
                    {
                      "Tên nguyên liệu": "Trà đen",
                      "Số lượng": 10,
                      "Đơn vị": "kg",
                      "Giá nhập": 150000,
                      "Ngưỡng cảnh báo": 2,
                      "Hạn sử dụng": "2024-12-31"
                    },
                    {
                      "Tên nguyên liệu": "Sữa tươi",
                      "Số lượng": 20,
                      "Đơn vị": "lít",
                      "Giá nhập": 35000,
                      "Ngưỡng cảnh báo": 5,
                      "Hạn sử dụng": "2024-06-01"
                    }
                  ]);
                  const wb = XLSX.utils.book_new();
                  XLSX.utils.book_append_sheet(wb, ws, "Template");
                  XLSX.writeFile(wb, "Mau_Import_Nguyen_Lieu.xlsx");
                }}
                className="flex-1 px-6 py-4 text-sm font-bold text-[#5A5A40] bg-[#5A5A40]/5 rounded-2xl hover:bg-[#5A5A40]/10 transition-all flex items-center justify-center gap-2"
              >
                <FileDown className="w-5 h-5" />
                Tải file mẫu
              </button>

              <div className="relative flex-1">
                <input 
                  type="file" 
                  accept=".xlsx, .xls"
                  onChange={handleImportExcel}
                  disabled={isImporting}
                  className={cn(
                    "absolute inset-0 w-full h-full opacity-0 cursor-pointer",
                    isImporting && "cursor-not-allowed"
                  )}
                />
                <div className={cn(
                  "w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg flex items-center justify-center gap-2 transition-all",
                  isImporting && "opacity-50"
                )}>
                  {isImporting ? (
                    <div className="animate-spin rounded-full h-5 w-5 border-t-2 border-b-2 border-white"></div>
                  ) : (
                    <FileUp className="w-5 h-5" />
                  )}
                  {isImporting ? "Đang xử lý..." : "Chọn file Excel"}
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}

// --- Sales Component ---
function Sales({ sales, products, user }: { sales: Sale[], products: Product[], user: User }) {
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [quantity, setQuantity] = useState(1);

  const handleRecordSale = async () => {
    if (!selectedProduct) return;
    try {
      await addDoc(collection(db, 'sales'), {
        productId: selectedProduct.id,
        productName: selectedProduct.name,
        quantity,
        totalPrice: selectedProduct.price * quantity,
        timestamp: new Date().toISOString(),
        userId: user.uid
      });
      setSelectedProduct(null);
      setQuantity(1);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'sales');
    }
  };

  return (
    <div className="space-y-8">
      <header>
        <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Ghi nhận bán hàng</h2>
        <p className="text-gray-500">Ghi lại các giao dịch mới.</p>
      </header>

      <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
        <div className="lg:col-span-2 space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <h3 className="text-lg font-bold mb-4">Chọn sản phẩm</h3>
            <div className="grid grid-cols-2 md:grid-cols-3 gap-4">
              {products.map(product => (
                <button 
                  key={product.id}
                  onClick={() => setSelectedProduct(product)}
                  className={cn(
                    "p-4 rounded-2xl border text-left transition-all",
                    selectedProduct?.id === product.id 
                      ? "border-[#5A5A40] bg-[#5A5A40]/5 shadow-md" 
                      : "border-gray-100 hover:border-gray-300"
                  )}
                >
                  <p className="font-bold text-[#1a1a1a]">{product.name}</p>
                  <p className="text-sm text-gray-500">{product.price.toLocaleString('vi-VN')} đ</p>
                </button>
              ))}
            </div>
          </div>

          <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
            <h3 className="text-lg font-bold mb-4">Lịch sử bán hàng gần đây</h3>
            <div className="space-y-3">
              {sales.slice(0, 5).map(sale => (
                <div key={sale.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl">
                  <div>
                    <p className="font-bold">{sale.productName}</p>
                    <p className="text-xs text-gray-400">{safeDateFormat(sale.timestamp, 'HH:mm - dd/MM/yyyy')}</p>
                  </div>
                  <div className="text-right">
                    <p className="font-bold text-[#5A5A40]">+{sale.totalPrice.toLocaleString('vi-VN')} đ</p>
                    <p className="text-xs text-gray-400">x{sale.quantity}</p>
                  </div>
                </div>
              ))}
            </div>
          </div>
        </div>

        <div className="space-y-6">
          <div className="bg-white p-6 rounded-3xl shadow-xl border border-[#5A5A40]/10 sticky top-8">
            <h3 className="text-xl font-serif font-bold mb-6">Chi tiết đơn hàng</h3>
            {selectedProduct ? (
              <div className="space-y-6">
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Sản phẩm:</span>
                  <span className="font-bold">{selectedProduct.name}</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Đơn giá:</span>
                  <span className="font-bold">{selectedProduct.price.toLocaleString('vi-VN')} đ</span>
                </div>
                <div className="flex justify-between items-center">
                  <span className="text-gray-500">Số lượng:</span>
                  <div className="flex items-center gap-3">
                    <button onClick={() => setQuantity(Math.max(1, quantity - 1))} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">-</button>
                    <span className="font-bold w-6 text-center">{quantity}</span>
                    <button onClick={() => setQuantity(quantity + 1)} className="w-8 h-8 rounded-full bg-gray-100 flex items-center justify-center">+</button>
                  </div>
                </div>
                <div className="pt-6 border-t border-gray-100">
                  <div className="flex justify-between items-center mb-6">
                    <span className="text-lg font-serif italic">Tổng cộng:</span>
                    <span className="text-2xl font-bold text-[#5A5A40]">{(selectedProduct.price * quantity).toLocaleString('vi-VN')} đ</span>
                  </div>
                  <button 
                    onClick={handleRecordSale}
                    className="w-full bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4a4a35] transition-all"
                  >
                    Hoàn tất đơn hàng
                  </button>
                </div>
              </div>
            ) : (
              <div className="text-center py-12 text-gray-400 italic">
                Vui lòng chọn sản phẩm để bắt đầu.
              </div>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

// --- Products Component ---
function Products({ products }: { products: Product[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [newProduct, setNewProduct] = useState({ name: '', price: 0, category: 'Trà sữa' });

  const handleAddProduct = async (e: React.FormEvent) => {
    e.preventDefault();
    try {
      await addDoc(collection(db, 'products'), newProduct);
      setNewProduct({ name: '', price: 0, category: 'Trà sữa' });
      setIsAdding(false);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'products');
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <header>
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Thực đơn</h2>
          <p className="text-gray-500">Quản lý danh sách đồ uống.</p>
        </header>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thêm món mới
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-6 rounded-3xl border border-[#5A5A40]/20 shadow-lg">
          <form onSubmit={handleAddProduct} className="grid grid-cols-1 md:grid-cols-4 gap-4">
            <input 
              type="text" 
              placeholder="Tên đồ uống" 
              className="p-3 rounded-xl border border-gray-200"
              value={newProduct.name}
              onChange={e => setNewProduct({...newProduct, name: e.target.value})}
              required
            />
            <input 
              type="number" 
              placeholder="Giá bán" 
              className="p-3 rounded-xl border border-gray-200"
              value={newProduct.price}
              onChange={e => setNewProduct({...newProduct, price: Number(e.target.value)})}
              required
            />
            <select 
              className="p-3 rounded-xl border border-gray-200"
              value={newProduct.category}
              onChange={e => setNewProduct({...newProduct, category: e.target.value})}
            >
              <option>Trà sữa</option>
              <option>Trà trái cây</option>
              <option>Cà phê</option>
              <option>Topping</option>
            </select>
            <div className="flex gap-2">
              <button type="submit" className="flex-1 bg-[#5A5A40] text-white rounded-xl font-medium">Lưu</button>
              <button type="button" onClick={() => setIsAdding(false)} className="px-4 py-2 text-gray-500">Hủy</button>
            </div>
          </form>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {products.map(product => (
          <div key={product.id} className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 group relative overflow-hidden">
            <div className="absolute top-0 right-0 p-4 opacity-0 group-hover:opacity-100 transition-opacity">
              <button 
                onClick={async () => {
                  try {
                    await deleteDoc(doc(db, 'products', product.id));
                  } catch (error) {
                    handleFirestoreError(error, OperationType.DELETE, `products/${product.id}`);
                  }
                }} 
                className="text-red-400 hover:text-red-600"
              >
                <Trash2 className="w-5 h-5" />
              </button>
            </div>
            <span className="text-xs font-bold text-[#5A5A40] bg-[#5A5A40]/10 px-3 py-1 rounded-full mb-3 inline-block">
              {product.category}
            </span>
            <h3 className="text-xl font-bold text-[#1a1a1a] mb-2">{product.name}</h3>
            <p className="text-2xl font-serif italic text-[#5A5A40]">{product.price.toLocaleString('vi-VN')} đ</p>
          </div>
        ))}
      </div>
    </div>
  );
}

// --- Settings Component ---
function SettingsView({ settings, users }: { settings: Settings, users: UserProfile[] }) {
  const [tempSettings, setTempSettings] = useState(settings);
  const [showSuccess, setShowSuccess] = useState(false);
  const [activeSubTab, setActiveSubTab] = useState<'general' | 'users'>('general');

  const [isResetting, setIsResetting] = useState(false);
  const [resetStep, setResetStep] = useState(0); // 0: none, 1: first confirm, 2: second confirm, 3: success

  useEffect(() => {
    setTempSettings(settings);
  }, [settings]);

  const handleSave = async () => {
    try {
      await setDoc(doc(db, 'settings', 'global'), { ...tempSettings }, { merge: true });
      setShowSuccess(true);
      setTimeout(() => setShowSuccess(false), 3000);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'settings/global');
    }
  };

  const performReset = async () => {
    setIsResetting(true);
    try {
      const collectionsToClear = ['inventory', 'movements', 'sales', 'products', 'recipes', 'employees', 'attendance'];
      
      for (const colName of collectionsToClear) {
        const snapshot = await getDocsFromServer(collection(db, colName));
        const docs = snapshot.docs;
        
        for (let i = 0; i < docs.length; i += 500) {
          const batch = writeBatch(db);
          const chunk = docs.slice(i, i + 500);
          chunk.forEach((doc) => {
            batch.delete(doc.ref);
          });
          await batch.commit();
        }
      }
      
      setResetStep(3);
      setTimeout(() => {
        window.location.href = window.location.origin + window.location.pathname + '?reset=' + Date.now();
      }, 2000);
    } catch (error) {
      console.error("Critical reset data error:", error);
      alert(`Có lỗi xảy ra: ${error instanceof Error ? error.message : 'Lỗi không xác định'}`);
    } finally {
      setIsResetting(false);
    }
  };

  return (
    <div className="space-y-8">
      <header className="flex justify-between items-center">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Cài đặt hệ thống</h2>
          <p className="text-gray-500">Cấu hình tham số và quản lý quyền truy cập.</p>
        </div>
        <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-black/5">
          <button 
            onClick={() => setActiveSubTab('general')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'general' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            Chung
          </button>
          <button 
            onClick={() => setActiveSubTab('users')}
            className={cn(
              "px-6 py-2 rounded-xl text-sm font-bold transition-all",
              activeSubTab === 'users' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
            )}
          >
            Người dùng
          </button>
        </div>
      </header>

      {activeSubTab === 'general' ? (
        <div className="grid grid-cols-1 lg:grid-cols-2 gap-8">
          {/* Admin Emails */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <ShieldCheck className="w-5 h-5 text-[#5A5A40]" />
              Quản trị viên (Admin Emails)
            </h3>
            <div className="space-y-4">
              <div className="flex gap-2">
                <input 
                  type="email" 
                  id="newAdminEmail"
                  placeholder="Nhập email admin mới..."
                  className="flex-1 p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  onKeyDown={(e) => {
                    if (e.key === 'Enter') {
                      const input = e.currentTarget;
                      const email = input.value.trim();
                      if (email && !tempSettings.adminEmails?.includes(email)) {
                        setTempSettings({
                          ...tempSettings,
                          adminEmails: [...(tempSettings.adminEmails || []), email]
                        });
                        input.value = '';
                      }
                    }
                  }}
                />
                <button 
                  onClick={() => {
                    const input = document.getElementById('newAdminEmail') as HTMLInputElement;
                    if (input.value && !tempSettings.adminEmails?.includes(input.value)) {
                      setTempSettings({
                        ...tempSettings,
                        adminEmails: [...(tempSettings.adminEmails || []), input.value]
                      });
                      input.value = '';
                    }
                  }}
                  className="bg-[#5A5A40] text-white px-6 rounded-2xl font-bold"
                >
                  Thêm
                </button>
              </div>
              <div className="space-y-2 max-h-40 overflow-y-auto pr-2">
                {tempSettings.adminEmails?.map(email => (
                  <div key={email} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl border border-gray-100">
                    <span className="text-sm">{email}</span>
                    <button 
                      onClick={() => setTempSettings({
                        ...tempSettings,
                        adminEmails: tempSettings.adminEmails?.filter(e => e !== email)
                      })}
                      className="text-red-500 hover:text-red-700"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                ))}
              </div>
            </div>
          </div>

          {/* Attendance Settings */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2">
              <MapPin className="w-5 h-5 text-[#5A5A40]" />
              Cấu hình chấm công
            </h3>
            <div className="space-y-4">
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Vĩ độ (Lat)</label>
                  <input 
                    type="number" 
                    value={tempSettings.shopLat || ''}
                    onChange={(e) => setTempSettings({ ...tempSettings, shopLat: Number(e.target.value) })}
                    className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  />
                </div>
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Kinh độ (Lng)</label>
                  <input 
                    type="number" 
                    value={tempSettings.shopLng || ''}
                    onChange={(e) => setTempSettings({ ...tempSettings, shopLng: Number(e.target.value) })}
                    className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  />
                </div>
              </div>
              <div className="grid grid-cols-2 gap-4">
                <div>
                  <label className="block text-sm font-medium text-gray-700 mb-1">Bán kính (mét)</label>
                  <input 
                    type="number" 
                    value={tempSettings.allowedRadius || ''}
                    onChange={(e) => setTempSettings({ ...tempSettings, allowedRadius: Number(e.target.value) })}
                    className="w-full p-4 bg-gray-50 rounded-2xl border border-gray-100 focus:ring-2 focus:ring-[#5A5A40] outline-none"
                  />
                </div>
                <div className="flex items-end">
                  <button 
                    onClick={() => {
                      navigator.geolocation.getCurrentPosition((pos) => {
                        setTempSettings({
                          ...tempSettings,
                          shopLat: pos.coords.latitude,
                          shopLng: pos.coords.longitude,
                          allowedRadius: tempSettings.allowedRadius || 50
                        });
                      }, (err) => alert('Không thể lấy vị trí hiện tại.'));
                    }}
                    className="w-full bg-gray-100 text-gray-700 py-4 rounded-2xl font-bold hover:bg-gray-200 transition-all flex items-center justify-center gap-2"
                  >
                    <MapPin className="w-4 h-4" />
                    Lấy vị trí
                  </button>
                </div>
              </div>
            </div>
          </div>

          {/* Data Management */}
          <div className="bg-white p-8 rounded-[32px] shadow-sm border border-black/5 space-y-6">
            <h3 className="text-xl font-bold flex items-center gap-2 text-red-600">
              <Database className="w-5 h-5" />
              Quản lý dữ liệu
            </h3>
            <div className="p-4 bg-red-50 rounded-2xl border border-red-100 space-y-4">
              <p className="text-sm text-red-800">
                <strong>Cảnh báo:</strong> Thao tác này sẽ xóa toàn bộ dữ liệu hệ thống. 
                Hành động này không thể hoàn tác.
              </p>
              
              {resetStep === 0 && (
                <button 
                  onClick={() => setResetStep(1)}
                  className="w-full bg-red-600 text-white py-4 rounded-2xl font-bold hover:bg-red-700 transition-colors flex items-center justify-center gap-2"
                >
                  <Trash2 className="w-5 h-5" />
                  Xóa toàn bộ dữ liệu
                </button>
              )}

              {resetStep === 1 && (
                <div className="bg-white p-4 rounded-2xl border-2 border-red-200">
                  <p className="text-red-700 font-bold mb-4 text-center">Xác nhận xóa TOÀN BỘ dữ liệu?</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setResetStep(0)} className="bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">Hủy</button>
                    <button onClick={() => setResetStep(2)} className="bg-red-600 text-white py-3 rounded-xl font-bold">Tiếp tục</button>
                  </div>
                </div>
              )}

              {resetStep === 2 && (
                <div className="bg-white p-4 rounded-2xl border-2 border-red-500">
                  <p className="text-red-700 font-bold mb-4 text-center italic">HÀNH ĐỘNG KHÔNG THỂ HOÀN TÁC!</p>
                  <div className="grid grid-cols-2 gap-3">
                    <button onClick={() => setResetStep(0)} className="bg-gray-100 text-gray-700 py-3 rounded-xl font-bold">Hủy</button>
                    <button 
                      onClick={performReset} 
                      disabled={isResetting}
                      className="bg-red-600 text-white py-3 rounded-xl font-bold flex items-center justify-center gap-2"
                    >
                      {isResetting ? <RefreshCw className="w-4 h-4 animate-spin" /> : 'XÁC NHẬN XÓA'}
                    </button>
                  </div>
                </div>
              )}

              {resetStep === 3 && (
                <div className="bg-emerald-50 p-6 rounded-2xl border-2 border-emerald-500 text-center animate-in zoom-in-95 duration-200">
                  <div className="w-12 h-12 bg-emerald-100 rounded-full flex items-center justify-center mx-auto mb-3">
                    <Plus className="text-emerald-600 w-6 h-6 rotate-45" />
                  </div>
                  <p className="text-emerald-700 font-bold">Xóa dữ liệu thành công!</p>
                  <p className="text-emerald-600 text-sm">Hệ thống đang tải lại...</p>
                </div>
              )}
            </div>
          </div>

          <div className="lg:col-span-2 flex justify-end gap-4">
            {showSuccess && (
              <div className="flex items-center text-emerald-600 font-bold animate-in fade-in slide-in-from-right-4">
                Đã lưu thành công!
              </div>
            )}
            <button 
              onClick={handleSave}
              className="bg-[#5A5A40] text-white px-12 py-4 rounded-2xl font-bold shadow-lg hover:bg-[#4a4a35] transition-all flex items-center gap-2"
            >
              <Save className="w-5 h-5" />
              Lưu cấu hình
            </button>
          </div>
        </div>
      ) : (
        <div className="bg-white rounded-[32px] shadow-sm border border-black/5 overflow-hidden">
          <table className="w-full text-left">
            <thead className="bg-gray-50 border-b border-gray-100">
              <tr>
                <th className="px-8 py-5 font-serif italic text-gray-500 text-sm">Người dùng</th>
                <th className="px-8 py-5 font-serif italic text-gray-500 text-sm">Email</th>
                <th className="px-8 py-5 font-serif italic text-gray-500 text-sm">Vai trò</th>
                <th className="px-8 py-5 font-serif italic text-gray-500 text-sm text-right">Thao tác</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {users.map(u => (
                <tr key={u.uid} className="hover:bg-gray-50 transition-colors">
                  <td className="px-8 py-6">
                    <div className="flex items-center gap-3">
                      <div className="w-10 h-10 rounded-full bg-[#5A5A40]/10 flex items-center justify-center text-[#5A5A40] font-bold">
                        {u.displayName?.charAt(0) || u.email.charAt(0).toUpperCase()}
                      </div>
                      <span className="font-bold text-[#1a1a1a]">{u.displayName || 'N/A'}</span>
                    </div>
                  </td>
                  <td className="px-8 py-6 text-gray-500 text-sm">{u.email}</td>
                  <td className="px-8 py-6">
                    <span className={cn(
                      "px-3 py-1 rounded-full text-[10px] font-bold uppercase tracking-wider",
                      u.role === 'admin' ? "bg-emerald-100 text-emerald-700" : "bg-blue-100 text-blue-700"
                    )}>
                      {u.role === 'admin' ? 'Quản trị' : 'Nhân viên'}
                    </span>
                  </td>
                  <td className="px-8 py-6 text-right">
                    <div className="flex justify-end gap-2">
                      <button 
                        onClick={async () => {
                          const newRole = u.role === 'admin' ? 'staff' : 'admin';
                          try {
                            await updateDoc(doc(db, 'users', u.uid), { role: newRole });
                          } catch (error) {
                            handleFirestoreError(error, OperationType.UPDATE, `users/${u.uid}`);
                          }
                        }}
                        className="p-2 hover:bg-gray-100 rounded-lg text-gray-400 hover:text-[#5A5A40] transition-colors"
                        title="Đổi vai trò"
                      >
                        <RefreshCw className="w-4 h-4" />
                      </button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

// --- Recipes Component ---
function Recipes({ recipes, products, inventory }: { recipes: ProductRecipe[], products: Product[], inventory: InventoryItem[] }) {
  const [isAdding, setIsAdding] = useState(false);
  const [selectedProduct, setSelectedProduct] = useState<Product | null>(null);
  const [recipeIngredients, setRecipeIngredients] = useState<RecipeIngredient[]>([]);
  
  const [currentIngredient, setCurrentIngredient] = useState({ inventoryItemId: '', quantity: 0 });

  const handleAddIngredient = () => {
    const item = inventory.find(i => i.id === currentIngredient.inventoryItemId);
    if (!item || currentIngredient.quantity <= 0) return;

    setRecipeIngredients([...recipeIngredients, {
      inventoryItemId: item.id,
      itemName: item.name,
      quantity: currentIngredient.quantity,
      unit: item.unit
    }]);
    setCurrentIngredient({ inventoryItemId: '', quantity: 0 });
  };

  const handleSaveRecipe = async () => {
    if (!selectedProduct || recipeIngredients.length === 0) return;

    try {
      const existing = recipes.find(r => r.productId === selectedProduct.id);
      if (existing) {
        await updateDoc(doc(db, 'recipes', existing.id), {
          ingredients: recipeIngredients
        });
      } else {
        await addDoc(collection(db, 'recipes'), {
          productId: selectedProduct.id,
          productName: selectedProduct.name,
          ingredients: recipeIngredients
        });
      }
      setIsAdding(false);
      setSelectedProduct(null);
      setRecipeIngredients([]);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'recipes');
    }
  };

  const handleEdit = (recipe: ProductRecipe) => {
    const product = products.find(p => p.id === recipe.productId);
    if (product) {
      setSelectedProduct(product);
      setRecipeIngredients(recipe.ingredients);
      setIsAdding(true);
    }
  };

  return (
    <div className="space-y-8">
      <div className="flex justify-between items-center">
        <header>
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Định mức bán hàng</h2>
          <p className="text-gray-500">Thiết lập định mức nguyên liệu cho từng món trong thực đơn.</p>
        </header>
        <button 
          onClick={() => setIsAdding(true)}
          className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl flex items-center gap-2"
        >
          <Plus className="w-5 h-5" />
          Thiết lập định mức
        </button>
      </div>

      {isAdding && (
        <div className="bg-white p-8 rounded-3xl border border-[#5A5A40]/20 shadow-xl space-y-6">
          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <div className="space-y-2">
              <label className="text-sm font-bold text-gray-600">Chọn món thực đơn</label>
              <select 
                className="w-full p-4 rounded-2xl border border-gray-200"
                value={selectedProduct?.id || ''}
                onChange={e => setSelectedProduct(products.find(p => p.id === e.target.value) || null)}
              >
                <option value="">-- Chọn món --</option>
                {products.map(p => (
                  <option key={p.id} value={p.id}>{p.name}</option>
                ))}
              </select>
            </div>
          </div>

          <div className="space-y-4">
            <h4 className="font-bold text-gray-700">Thành phần nguyên liệu</h4>
            <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
              <select 
                className="p-3 rounded-xl border border-gray-200"
                value={currentIngredient.inventoryItemId}
                onChange={e => setCurrentIngredient({...currentIngredient, inventoryItemId: e.target.value})}
              >
                <option value="">-- Chọn nguyên liệu --</option>
                {inventory.map(i => (
                  <option key={i.id} value={i.id}>{i.name} ({i.unit})</option>
                ))}
              </select>
              <input 
                type="number" 
                placeholder="Số lượng định mức" 
                className="p-3 rounded-xl border border-gray-200"
                value={currentIngredient.quantity || ''}
                onChange={e => setCurrentIngredient({...currentIngredient, quantity: Number(e.target.value)})}
              />
              <button 
                onClick={handleAddIngredient}
                className="bg-gray-100 text-gray-700 rounded-xl font-bold hover:bg-gray-200 transition-colors"
              >
                Thêm vào định mức
              </button>
            </div>

            <div className="space-y-2">
              {recipeIngredients.map((ri, idx) => (
                <div key={idx} className="flex items-center justify-between p-3 bg-gray-50 rounded-xl">
                  <span>{ri.itemName}</span>
                  <div className="flex items-center gap-4">
                    <span className="font-bold">{ri.quantity} {ri.unit}</span>
                    <button 
                      onClick={() => setRecipeIngredients(recipeIngredients.filter((_, i) => i !== idx))}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
              ))}
            </div>
          </div>

          <div className="flex gap-3 pt-4">
            <button 
              onClick={handleSaveRecipe}
              className="flex-1 bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg"
            >
              Lưu định mức
            </button>
            <button 
              onClick={() => { setIsAdding(false); setSelectedProduct(null); setRecipeIngredients([]); }}
              className="px-8 py-4 text-gray-500 font-bold"
            >
              Hủy
            </button>
          </div>
        </div>
      )}

      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
        {recipes.map(recipe => (
          <div key={recipe.id} className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 group">
            <div className="flex justify-between items-start mb-4">
              <h3 className="text-xl font-bold text-[#1a1a1a]">{recipe.productName}</h3>
              <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                <button onClick={() => handleEdit(recipe)} className="text-blue-500 hover:text-blue-700">
                  Sửa
                </button>
                <button 
                  onClick={async () => {
                    try {
                      await deleteDoc(doc(db, 'recipes', recipe.id));
                    } catch (error) {
                      handleFirestoreError(error, OperationType.DELETE, `recipes/${recipe.id}`);
                    }
                  }}
                  className="text-red-400 hover:text-red-600"
                >
                  <Trash2 className="w-5 h-5" />
                </button>
              </div>
            </div>
            <div className="space-y-2">
              {recipe.ingredients.map((ri, idx) => (
                <div key={idx} className="flex justify-between text-sm text-gray-600">
                  <span>{ri.itemName}</span>
                  <span className="font-medium">{ri.quantity} {ri.unit}</span>
                </div>
              ))}
            </div>
          </div>
        ))}
        {recipes.length === 0 && (
          <div className="col-span-full py-20 text-center text-gray-400 italic">
            Chưa có định mức nào được thiết lập.
          </div>
        )}
      </div>
    </div>
  );
}

// --- Timekeeping Component ---
function Timekeeping({ employees, attendance, user, settings, isAdmin }: { employees: Employee[], attendance: Attendance[], user: User, settings: Settings, isAdmin: boolean }) {
  const [subTab, setSubTab] = useState<'employees' | 'attendance'>('attendance');
  const [isAddingEmployee, setIsAddingEmployee] = useState(false);
  const [newEmployee, setNewEmployee] = useState<Partial<Employee>>({ status: 'active' });
  const [editingEmployee, setEditingEmployee] = useState<Employee | null>(null);

  const handleAddEmployee = async () => {
    if (!newEmployee.name || !newEmployee.role) return;
    try {
      await addDoc(collection(db, 'employees'), {
        ...newEmployee,
        status: 'active'
      });
      setIsAddingEmployee(false);
      setNewEmployee({ status: 'active' });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'employees');
    }
  };

  const handleUpdateEmployee = async () => {
    if (!editingEmployee) return;
    try {
      const { id, ...data } = editingEmployee;
      await updateDoc(doc(db, 'employees', id), data);
      setEditingEmployee(null);
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `employees/${editingEmployee.id}`);
    }
  };

  const getCurrentPosition = (): Promise<GeolocationPosition> => {
    return new Promise((resolve, reject) => {
      if (!navigator.geolocation) {
        reject(new Error('Trình duyệt không hỗ trợ định vị.'));
      }
      navigator.geolocation.getCurrentPosition(resolve, reject, { enableHighAccuracy: true });
    });
  };

  const checkLocation = async () => {
    if (!settings.shopLat || !settings.shopLng || !settings.allowedRadius) return true;
    
    try {
      const pos = await getCurrentPosition();
      const dist = calculateDistance(pos.coords.latitude, pos.coords.longitude, settings.shopLat, settings.shopLng);
      if (dist > settings.allowedRadius) {
        alert(`Bạn đang ở cách cửa hàng ${Math.round(dist)}m. Vui lòng đến gần cửa hàng hơn (trong phạm vi ${settings.allowedRadius}m) để chấm công.`);
        return false;
      }
      return { lat: pos.coords.latitude, lng: pos.coords.longitude };
    } catch (error) {
      alert('Không thể lấy vị trí của bạn. Vui lòng cho phép truy cập vị trí để chấm công.');
      return false;
    }
  };

  const handleClockIn = async (employee: Employee) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const existing = attendance.find(a => a.employeeId === employee.id && a.date === today && !a.clockOut);
    
    if (existing) {
      alert(`${employee.name} đã chấm công vào rồi!`);
      return;
    }

    const loc = await checkLocation();
    if (!loc) return;

    try {
      await addDoc(collection(db, 'attendance'), {
        employeeId: employee.id,
        employeeName: employee.name,
        clockIn: new Date().toISOString(),
        date: today,
        status: 'present',
        clockInLoc: loc === true ? null : loc
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, 'attendance');
    }
  };

  const handleClockOut = async (employee: Employee) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    const active = attendance.find(a => a.employeeId === employee.id && a.date === today && !a.clockOut);
    
    if (!active) {
      alert(`${employee.name} chưa chấm công vào!`);
      return;
    }

    const loc = await checkLocation();
    if (!loc) return;

    const clockOutTime = new Date();
    const clockInTime = new Date(active.clockIn);
    const diffMs = clockOutTime.getTime() - clockInTime.getTime();
    const diffHrs = Math.round((diffMs / (1000 * 60 * 60)) * 100) / 100;

    try {
      await updateDoc(doc(db, 'attendance', active.id), {
        clockOut: clockOutTime.toISOString(),
        totalHours: diffHrs,
        clockOutLoc: loc === true ? null : loc
      });
    } catch (error) {
      handleFirestoreError(error, OperationType.WRITE, `attendance/${active.id}`);
    }
  };

  const getActiveAttendance = (employeeId: string) => {
    const today = format(new Date(), 'yyyy-MM-dd');
    return attendance.find(a => a.employeeId === employeeId && a.date === today && !a.clockOut);
  };

  const exportPayrollToExcel = () => {
    const data = attendance.map(record => {
      const employee = employees.find(e => e.id === record.employeeId);
      const hourlyRate = employee?.hourlyRate || 0;
      const totalSalary = (record.totalHours || 0) * hourlyRate;

      return {
        'Tên nhân viên': record.employeeName,
        'Ngày': safeDateFormat(record.clockIn, 'dd/MM/yyyy'),
        'Giờ vào': safeDateFormat(record.clockIn, 'HH:mm'),
        'Giờ ra': record.clockOut ? safeDateFormat(record.clockOut, 'HH:mm') : '-',
        'Tổng giờ': record.totalHours || 0,
        'Định mức lương (VNĐ/h)': hourlyRate,
        'Tổng lương (VNĐ)': totalSalary
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(data);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, "Payroll");
    
    const fileName = `Bang_luong_nhan_vien_${format(new Date(), 'dd_MM_yyyy')}.xlsx`;
    XLSX.writeFile(workbook, fileName);
  };

  return (
    <div className="space-y-8">
      <header className="flex flex-col md:flex-row md:items-center justify-between gap-4">
        <div>
          <h2 className="text-3xl font-serif font-bold text-[#1a1a1a]">Quản lý nhân sự</h2>
          <p className="text-gray-500">Chấm công và quản lý thông tin nhân viên.</p>
        </div>
        {isAdmin && (
          <div className="flex bg-white p-1 rounded-2xl shadow-sm border border-black/5 self-start">
            <button 
              onClick={() => setSubTab('attendance')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                subTab === 'attendance' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              Chấm công
            </button>
            <button 
              onClick={() => setSubTab('employees')}
              className={cn(
                "px-6 py-2 rounded-xl text-sm font-bold transition-all",
                subTab === 'employees' ? "bg-[#5A5A40] text-white" : "text-gray-500 hover:bg-gray-50"
              )}
            >
              Nhân viên
            </button>
          </div>
        )}
      </header>

      {subTab === 'employees' && isAdmin && (
        <div className="space-y-6">
          <div className="flex justify-end">
            <button 
              onClick={() => setIsAddingEmployee(true)}
              className="bg-[#5A5A40] text-white px-6 py-3 rounded-2xl flex items-center gap-2 font-bold shadow-lg"
            >
              <Plus className="w-5 h-5" />
              Thêm nhân viên
            </button>
          </div>

          {(isAddingEmployee || editingEmployee) && (
            <div className="bg-white p-8 rounded-3xl border border-[#5A5A40]/20 shadow-xl space-y-6 animate-in fade-in slide-in-from-top-4">
              <h3 className="text-xl font-bold text-gray-900">
                {editingEmployee ? 'Sửa thông tin nhân viên' : 'Thêm nhân viên mới'}
              </h3>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Họ và tên</label>
                  <input 
                    type="text" 
                    className="w-full p-4 rounded-2xl border border-gray-200"
                    placeholder="Nguyễn Văn A"
                    value={editingEmployee ? editingEmployee.name : newEmployee.name || ''}
                    onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, name: e.target.value}) : setNewEmployee({...newEmployee, name: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Vị trí / Vai trò</label>
                  <input 
                    type="text" 
                    className="w-full p-4 rounded-2xl border border-gray-200"
                    placeholder="Pha chế, Phục vụ..."
                    value={editingEmployee ? editingEmployee.role : newEmployee.role || ''}
                    onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, role: e.target.value}) : setNewEmployee({...newEmployee, role: e.target.value})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Lương theo giờ (VNĐ)</label>
                  <input 
                    type="number" 
                    className="w-full p-4 rounded-2xl border border-gray-200"
                    placeholder="25000"
                    value={editingEmployee ? editingEmployee.hourlyRate : newEmployee.hourlyRate || ''}
                    onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, hourlyRate: Number(e.target.value)}) : setNewEmployee({...newEmployee, hourlyRate: Number(e.target.value)})}
                  />
                </div>
                <div className="space-y-2">
                  <label className="text-sm font-bold text-gray-600">Số điện thoại</label>
                  <input 
                    type="text" 
                    className="w-full p-4 rounded-2xl border border-gray-200"
                    placeholder="090..."
                    value={editingEmployee ? editingEmployee.phone : newEmployee.phone || ''}
                    onChange={e => editingEmployee ? setEditingEmployee({...editingEmployee, phone: e.target.value}) : setNewEmployee({...newEmployee, phone: e.target.value})}
                  />
                </div>
              </div>
              <div className="flex gap-3 pt-4">
                <button 
                  onClick={editingEmployee ? handleUpdateEmployee : handleAddEmployee}
                  className="flex-1 bg-[#5A5A40] text-white py-4 rounded-2xl font-bold shadow-lg"
                >
                  {editingEmployee ? 'Cập nhật' : 'Lưu nhân viên'}
                </button>
                <button 
                  onClick={() => { setIsAddingEmployee(false); setEditingEmployee(null); }}
                  className="px-8 py-4 text-gray-500 font-bold"
                >
                  Hủy
                </button>
              </div>
            </div>
          )}

          <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
            {employees.map(emp => (
              <div key={emp.id} className="bg-white p-6 rounded-3xl shadow-sm border border-black/5 group hover:shadow-md transition-all">
                <div className="flex justify-between items-start mb-4">
                  <div className="flex items-center gap-3">
                    <div className="w-12 h-12 bg-[#5A5A40]/10 rounded-full flex items-center justify-center text-[#5A5A40] font-bold text-xl">
                      {emp.name.charAt(0)}
                    </div>
                    <div>
                      <h3 className="font-bold text-gray-900">{emp.name}</h3>
                      <p className="text-xs text-gray-500">{emp.role}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 opacity-0 group-hover:opacity-100 transition-opacity">
                    <button onClick={() => setEditingEmployee(emp)} className="text-blue-500 hover:text-blue-700 text-sm font-bold">Sửa</button>
                    <button 
                      onClick={async () => {
                        if (confirm(`Xóa nhân viên ${emp.name}?`)) {
                          try {
                            await deleteDoc(doc(db, 'employees', emp.id));
                          } catch (error) {
                            handleFirestoreError(error, OperationType.DELETE, `employees/${emp.id}`);
                          }
                        }
                      }}
                      className="text-red-400 hover:text-red-600"
                    >
                      <Trash2 className="w-4 h-4" />
                    </button>
                  </div>
                </div>
                <div className="space-y-2 text-sm text-gray-600">
                  <div className="flex justify-between">
                    <span>Lương/giờ:</span>
                    <span className="font-bold text-[#5A5A40]">{emp.hourlyRate?.toLocaleString('vi-VN')} đ</span>
                  </div>
                  <div className="flex justify-between">
                    <span>SĐT:</span>
                    <span>{emp.phone || 'N/A'}</span>
                  </div>
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {subTab === 'attendance' && (
        <div className="space-y-8">
          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            {/* Clocking Section */}
            <div className="lg:col-span-1 space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
                <h3 className="text-lg font-bold mb-6 flex items-center gap-2">
                  <Clock className="w-5 h-5 text-[#5A5A40]" />
                  Chấm công hôm nay
                </h3>
                <div className="space-y-4">
                  {employees.filter(e => e.status === 'active').map(emp => {
                    const active = getActiveAttendance(emp.id);
                    return (
                      <div key={emp.id} className="flex items-center justify-between p-4 bg-gray-50 rounded-2xl border border-gray-100">
                        <div>
                          <p className="font-bold text-gray-900">{emp.name}</p>
                          <p className="text-xs text-gray-500">
                            {active ? `Vào lúc: ${safeDateFormat(active.clockIn, 'HH:mm')}` : 'Chưa vào làm'}
                          </p>
                        </div>
                        {active ? (
                          <button 
                            onClick={() => handleClockOut(emp)}
                            className="bg-amber-100 text-amber-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-amber-200 transition-colors"
                          >
                            Kết thúc
                          </button>
                        ) : (
                          <button 
                            onClick={() => handleClockIn(emp)}
                            className="bg-emerald-100 text-emerald-700 px-4 py-2 rounded-xl text-xs font-bold hover:bg-emerald-200 transition-colors"
                          >
                            Bắt đầu
                          </button>
                        )}
                      </div>
                    );
                  })}
                </div>
              </div>
            </div>

            {/* History Section */}
            <div className="lg:col-span-2 space-y-6">
              <div className="bg-white p-6 rounded-3xl shadow-sm border border-black/5">
                <h3 className="text-lg font-bold mb-6 flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Calendar className="w-5 h-5 text-[#5A5A40]" />
                    Lịch sử làm việc
                  </div>
                  <div className="flex items-center gap-3">
                    <button 
                      onClick={exportPayrollToExcel}
                      className="text-xs font-bold text-[#5A5A40] bg-[#5A5A40]/10 px-3 py-1.5 rounded-lg flex items-center gap-1.5 hover:bg-[#5A5A40]/20 transition-colors"
                    >
                      <FileDown className="w-3.5 h-3.5" />
                      Xuất bảng lương
                    </button>
                    <span className="text-xs font-normal text-gray-500">Gần đây nhất</span>
                  </div>
                </h3>
                <div className="overflow-x-auto">
                  <table className="w-full text-left">
                    <thead>
                      <tr className="text-xs text-gray-400 uppercase tracking-wider border-b border-gray-100">
                        <th className="pb-4 font-medium">Nhân viên</th>
                        <th className="pb-4 font-medium">Ngày</th>
                        <th className="pb-4 font-medium">Giờ vào</th>
                        <th className="pb-4 font-medium">Giờ ra</th>
                        <th className="pb-4 font-medium text-right">Tổng giờ</th>
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {attendance.slice(0, 20).map(record => (
                        <tr key={record.id} className="text-sm">
                          <td className="py-4 font-bold text-gray-900">{record.employeeName}</td>
                          <td className="py-4 text-gray-500">{safeDateFormat(record.clockIn, 'dd/MM/yyyy')}</td>
                          <td className="py-4 text-emerald-600 font-medium">{safeDateFormat(record.clockIn, 'HH:mm')}</td>
                          <td className="py-4 text-amber-600 font-medium">
                            {record.clockOut ? safeDateFormat(record.clockOut, 'HH:mm') : '-'}
                          </td>
                          <td className="py-4 text-right font-bold text-[#5A5A40]">
                            {record.totalHours ? `${record.totalHours}h` : '-'}
                          </td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                  {attendance.length === 0 && (
                    <p className="text-center py-10 text-gray-400 italic">Chưa có dữ liệu chấm công.</p>
                  )}
                </div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
