import { createSlice, createAsyncThunk } from "@reduxjs/toolkit";
import axios from "../../utils/axios";

const authHeader = (getState) => ({
  headers: { Authorization: getState().auth.token },
});

export const fetchDepartments = createAsyncThunk(
  "department/fetchAll",
  async (_, { getState }) => {
    try {
      const { data } = await axios.get("/api/department", authHeader(getState));
      if (data.success) return { success: true, departments: data.departments };
      return { success: false, message: data.message };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to fetch departments",
      };
    }
  }
);

export const createDepartment = createAsyncThunk(
  "department/create",
  async ({ code, name, description }, { getState }) => {
    try {
      const { data } = await axios.post(
        "/api/department",
        { code, name, description },
        authHeader(getState)
      );
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to create department",
      };
    }
  }
);

export const updateDepartment = createAsyncThunk(
  "department/update",
  async ({ id, name, description, isActive }, { getState }) => {
    try {
      const body = {};
      if (name !== undefined) body.name = name;
      if (description !== undefined) body.description = description;
      if (isActive !== undefined) body.isActive = isActive;
      const { data } = await axios.patch(`/api/department/${id}`, body, authHeader(getState));
      return data;
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to update department",
      };
    }
  }
);

export const deactivateDepartment = createAsyncThunk(
  "department/deactivate",
  async (id, { getState }) => {
    try {
      const { data } = await axios.delete(`/api/department/${id}`, authHeader(getState));
      return { ...data, id };
    } catch (error) {
      return {
        success: false,
        message: error.response?.data?.message || "Failed to deactivate department",
      };
    }
  }
);

const departmentSlice = createSlice({
  name: "department",
  initialState: {
    departments: [],
    loading: false,
    submitting: false,
  },
  reducers: {},
  extraReducers: (builder) => {
    builder
      .addCase(fetchDepartments.pending, (state) => {
        state.loading = true;
      })
      .addCase(fetchDepartments.fulfilled, (state, action) => {
        state.loading = false;
        if (action.payload.success) {
          state.departments = action.payload.departments;
        }
      })
      .addCase(fetchDepartments.rejected, (state) => {
        state.loading = false;
      })
      .addCase(createDepartment.pending, (state) => { state.submitting = true; })
      .addCase(createDepartment.fulfilled, (state, action) => {
        state.submitting = false;
        if (action.payload.success) {
          state.departments = [action.payload.department, ...state.departments];
        }
      })
      .addCase(createDepartment.rejected, (state) => { state.submitting = false; })
      .addCase(updateDepartment.fulfilled, (state, action) => {
        if (action.payload.success) {
          const d = action.payload.department;
          state.departments = state.departments.map((x) => (x._id === d._id ? d : x));
        }
      })
      .addCase(deactivateDepartment.fulfilled, (state, action) => {
        if (action.payload.success) {
          state.departments = state.departments.map((x) =>
            x._id === action.payload.id ? { ...x, isActive: false } : x
          );
        }
      });
  },
});

export default departmentSlice.reducer;
