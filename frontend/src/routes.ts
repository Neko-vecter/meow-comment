import { index, route, type RouteConfig } from "@react-router/dev/routes";

export default [
    index("routes/redirect.tsx"),
    route("login", "routes/login.tsx"),
    route("dashboard", "pages/dashboard/DashboardPage.tsx"),
    route("setting/users", "pages/users/UsersPage.tsx"),
    route("*", "routes/not-found.tsx"),
] satisfies RouteConfig;
