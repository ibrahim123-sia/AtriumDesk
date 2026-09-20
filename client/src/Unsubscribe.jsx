import React, { useEffect, useState } from "react";
import { useSearchParams, Link } from "react-router-dom";
import axios from "./utils/axios";

// Rev 5 §10 — public, unauthenticated page reached from a digest/reminder
// email's unsubscribe link. The token itself is the auth (see
// server/services/notify.js's signUnsubscribeToken).
const Unsubscribe = () => {
  const [params] = useSearchParams();
  const [status, setStatus] = useState("loading"); // loading | success | error
  const [message, setMessage] = useState("");

  useEffect(() => {
    const token = params.get("token");
    if (!token) {
      setStatus("error");
      setMessage("Missing unsubscribe token.");
      return;
    }
    axios
      .get(`/api/user/unsubscribe?token=${encodeURIComponent(token)}`)
      .then(({ data }) => {
        setStatus(data.success ? "success" : "error");
        setMessage(data.message);
      })
      .catch((error) => {
        setStatus("error");
        setMessage(error.response?.data?.message || "Something went wrong.");
      });
  }, [params]);

  return (
    <div className="h-screen flex items-center justify-center bg-gray-50 dark:bg-slate-900 px-4">
      <div className="max-w-sm w-full text-center p-6 rounded-xl border border-gray-200 dark:border-slate-700 bg-white dark:bg-slate-800">
        <h1 className="text-lg font-semibold mb-2 text-gray-900 dark:text-white">
          {status === "loading" ? "Unsubscribing…" : status === "success" ? "Unsubscribed" : "Something went wrong"}
        </h1>
        <p className="text-sm text-gray-600 dark:text-gray-300">{message}</p>
        <Link to="/login" className="inline-block mt-4 text-sm text-blue-600 dark:text-blue-400">
          Back to AtriumDesk
        </Link>
      </div>
    </div>
  );
};

export default Unsubscribe;
