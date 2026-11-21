import { Navigate } from "react-router";
import { ADMIN_ROUTES } from "../route-paths";

export default function RedirectToOverview() {
    return <Navigate replace to={ADMIN_ROUTES.overview} />;
}
