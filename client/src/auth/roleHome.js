// Where each role lands after signing in (and when opening "/" signed in).
export const homeFor = (user) =>
  user?.role === "staff" ? "/staff/dashboard" : user?.role === "admin" ? "/admin/dashboard" : "/chat";
