import axios from "axios";

const pythonAxios = axios.create({
  baseURL: import.meta.env.VITE_PYTHON_URL || "http://localhost:8000",
});

// Attach the same Redux auth token that Node uses.
// Caller passes `getState` via the redux thunk pattern (see adminDataSlice).
export const withAuth = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

export const withAuthMultipart = (getState) => ({
  headers: {
    Authorization: getState().auth.token,
    "Content-Type": "multipart/form-data",
  },
});

export default pythonAxios;
