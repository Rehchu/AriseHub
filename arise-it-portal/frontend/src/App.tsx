import { Routes, Route } from "react-router-dom";
import Layout from "./components/Layout";
import ProtectedRoute from "./components/ProtectedRoute";
import Login from "./pages/Login";
import Dashboard from "./pages/Dashboard";
import AssetList from "./pages/AssetList";
import AssetDetail from "./pages/AssetDetail";
import AssetForm from "./pages/AssetForm";
import Requests from "./pages/Requests";
import RequestDetail from "./pages/RequestDetail";
import WifiVault from "./pages/WifiVault";
import Consumables from "./pages/Consumables";
import Licenses from "./pages/Licenses";
import Campuses from "./pages/Campuses";
import Categories from "./pages/Categories";
import Users from "./pages/Users";
import AuditLog from "./pages/AuditLog";
import Profile from "./pages/Profile";
import AccessPasses from "./pages/AccessPasses";
import PublicRequest from "./pages/PublicRequest";
import QuickAccess from "./pages/QuickAccess";
import GuestEquipment from "./pages/GuestEquipment";
import GuestWifi from "./pages/GuestWifi";
import NotFound from "./pages/NotFound";

export default function App() {
  return (
    <Routes>
      <Route path="/login" element={<Login />} />
      <Route path="/request" element={<PublicRequest />} />
      <Route path="/go" element={<QuickAccess />} />
      <Route path="/go/equipment" element={<GuestEquipment />} />
      <Route path="/go/wifi" element={<GuestWifi />} />
      <Route
        path="/"
        element={
          <ProtectedRoute>
            <Layout />
          </ProtectedRoute>
        }
      >
        <Route index element={<Dashboard />} />
        <Route path="assets" element={<AssetList />} />
        <Route path="assets/new" element={<AssetForm />} />
        <Route path="assets/:id" element={<AssetDetail />} />
        <Route path="assets/:id/edit" element={<AssetForm />} />
        <Route path="requests" element={<Requests />} />
        <Route path="requests/:id" element={<RequestDetail />} />
        <Route path="wifi" element={<WifiVault />} />
        <Route path="consumables" element={<Consumables />} />
        <Route path="licenses" element={<Licenses />} />
        <Route path="campuses" element={<Campuses />} />
        <Route path="categories" element={<Categories />} />
        <Route path="users" element={<Users />} />
        <Route path="access-passes" element={<AccessPasses />} />
        <Route path="audit-log" element={<AuditLog />} />
        <Route path="profile" element={<Profile />} />
      </Route>
      <Route path="*" element={<NotFound />} />
    </Routes>
  );
}
