export interface UserProfile {
  uid: string;
  email: string;
  role: 'admin' | 'staff';
  displayName?: string;
}

export interface InventoryItem {
  id: string;
  name: string;
  quantity: number;
  unit: string;
  minThreshold: number;
  purchasePrice: number;
  expiryDate: string;
  lastUpdated: string;
}

export interface Product {
  id: string;
  name: string;
  price: number;
  category: string;
}

export interface RecipeIngredient {
  inventoryItemId: string;
  itemName: string;
  quantity: number;
  unit: string;
}

export interface ProductRecipe {
  id: string;
  productId: string;
  productName: string;
  ingredients: RecipeIngredient[];
}

export interface Sale {
  id: string;
  productId: string;
  productName: string;
  quantity: number;
  totalPrice: number;
  timestamp: string;
  userId: string;
}

export interface Settings {
  shopLat?: number;
  shopLng?: number;
  allowedRadius?: number;
  allowedWifi?: string;
  adminEmails?: string[];
}

export interface StockMovement {
  id: string;
  itemId: string;
  itemName: string;
  quantity: number;
  type: 'in' | 'out';
  reason: string;
  timestamp: string;
  userId: string;
}

export interface Employee {
  id: string;
  name: string;
  role: string;
  hourlyRate?: number;
  phone?: string;
  status: 'active' | 'inactive';
}

export interface Attendance {
  id: string;
  employeeId: string;
  employeeName: string;
  clockIn: string;
  clockOut?: string;
  totalHours?: number;
  date: string;
  status: 'present' | 'late' | 'absent';
  clockInLoc?: { lat: number, lng: number };
  clockOutLoc?: { lat: number, lng: number };
}
