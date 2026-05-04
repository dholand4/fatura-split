import { Navigate } from "react-router-dom";
import { getStoredProfileMode } from "@/constants/appProfiles";

export default function Index() {
  const target = getStoredProfileMode() ? "/home" : "/login";

  return <Navigate to={target} replace />;
}
