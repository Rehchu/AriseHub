export type Role = "super_admin" | "campus_admin" | "viewer";

export interface User {
  id: number;
  name: string;
  email: string;
  role: Role;
  campusId: number | null;
  active?: boolean;
  mustChangePassword: boolean;
}

export interface Campus {
  id: number;
  name: string;
  address: string | null;
  timezone: string | null;
  notes: string | null;
}

export interface Location {
  id: number;
  campusId: number;
  name: string;
  description: string | null;
}

export interface Category {
  id: number;
  name: string;
  icon: string | null;
}

export interface AssetModel {
  id: number;
  categoryId: number;
  brand: string;
  modelName: string;
  specs: string | null;
}

export type AssetStatus = "available" | "checked_out" | "in_repair" | "retired" | "lost";

export interface Asset {
  id: number;
  assetTag: string;
  serialNumber: string | null;
  modelId: number;
  model: AssetModel;
  campusId: number;
  locationId: number | null;
  status: AssetStatus;
  assignedToUserId: number | null;
  assignedToName: string | null;
  purchaseDate: string | null;
  purchaseCost: number | null;
  warrantyExpiry: string | null;
  photoUrl: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface AssetHistoryEntry {
  id: number;
  assetId: number;
  action: string;
  fromValue: string | null;
  toValue: string | null;
  performedBy: number | null;
  notes: string | null;
  createdAt: string;
}

export interface MaintenanceRecord {
  id: number;
  assetId: number;
  description: string;
  cost: number | null;
  vendor: string | null;
  performedAt: string;
  nextDueDate: string | null;
}

export interface WifiNetwork {
  id: number;
  campusId: number;
  locationId: number | null;
  ssid: string;
  password: string;
  securityType: string;
  band: string | null;
  vlan: string | null;
  isGuest: boolean;
  notes: string | null;
  updatedAt: string;
}

export type TicketCategory = "hardware" | "software" | "network" | "account" | "other";
export type TicketPriority = "urgent" | "high" | "medium" | "low";
export type TicketStatus = "open" | "in_progress" | "waiting" | "resolved" | "closed";

export interface Ticket {
  id: number;
  subject: string;
  description: string | null;
  requesterUserId: number | null;
  requesterName: string;
  requesterEmail?: string | null;
  isGuest?: boolean;
  campusId: number;
  category: TicketCategory;
  priority: TicketPriority;
  status: TicketStatus;
  assignedToUserId: number | null;
  dueAt: string | null;
  createdAt: string;
  updatedAt: string;
}

export interface TicketComment {
  id: number;
  ticketId: number;
  userId: number;
  userName: string;
  body: string;
  createdAt: string;
}

export interface Consumable {
  id: number;
  name: string;
  category: string | null;
  campusId: number;
  quantityOnHand: number;
  reorderThreshold: number;
  notes: string | null;
  updatedAt: string;
}

export interface SoftwareLicense {
  id: number;
  name: string;
  vendor: string | null;
  campusId: number | null;
  seatsTotal: number;
  seatsUsed: number;
  renewalDate: string | null;
  cost: number | null;
  notes: string | null;
  updatedAt: string;
}

export interface LicenseAssignment {
  id: number;
  licenseId: number;
  assignedToUserId: number;
  userName: string;
  createdAt: string;
}

export interface AccessPass {
  id: number;
  label: string;
  scope: "equipment" | "wifi";
  campusId: number;
  campusName: string;
  wifiAllNetworks?: boolean;
  active: boolean;
  lastUsedAt: string | null;
  createdAt: string;
}

export interface GuestAsset {
  id: number;
  assetTag: string;
  brand: string;
  modelName: string;
  category: string;
  status: AssetStatus;
  assignedToName: string | null;
  notes: string | null;
  lastMaintenance: { description: string; performedAt: string; nextDueDate: string | null } | null;
}

export interface GuestNetwork {
  id: number;
  ssid: string;
  password: string;
  securityType: string;
  band: string | null;
  isGuest: boolean;
  notes: string | null;
}

export interface AuditEntry {
  id: number;
  userId: number | null;
  userName: string | null;
  action: string;
  entityType: string;
  entityId: number | null;
  details: string | null;
  ipAddress: string | null;
  createdAt: string;
}
