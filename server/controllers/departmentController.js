export const listDepartments = async (req, res) => {
  try {
    const filter = req.user?.role === "admin" ? {} : { isActive: true };
    const departments = await req.models.Department.find(filter).sort({ code: 1 });
    res.json({ success: true, departments });
  } catch (error) {
    console.error("listDepartments error:", error);
    res.status(500).json({ success: false, message: "Failed to list departments" });
  }
};

export const createDepartment = async (req, res) => {
  const { code, name, description } = req.body;
  if (!code || !name) {
    return res.status(400).json({ success: false, message: "code and name are required" });
  }
  try {
    const exists = await req.models.Department.findOne({ code: code.toUpperCase() });
    if (exists) {
      return res.status(409).json({ success: false, message: "Department code already exists" });
    }
    const dept = await req.models.Department.create({
      code: code.toUpperCase(),
      name,
      description: description || "",
    });
    res.status(201).json({ success: true, department: dept });
  } catch (error) {
    console.error("createDepartment error:", error);
    res.status(500).json({ success: false, message: "Failed to create department" });
  }
};

export const updateDepartment = async (req, res) => {
  const { id } = req.params;
  const { name, description, isActive, headUserId, slaThresholdHours } = req.body;
  if (slaThresholdHours !== undefined && slaThresholdHours !== null && slaThresholdHours <= 0) {
    return res.status(400).json({ success: false, message: "slaThresholdHours must be a positive number" });
  }
  try {
    const dept = await req.models.Department.findById(id);
    if (!dept) return res.status(404).json({ success: false, message: "Department not found" });
    if (name !== undefined) dept.name = name;
    if (description !== undefined) dept.description = description;
    if (isActive !== undefined) dept.isActive = isActive;
    if (headUserId !== undefined) {
      if (headUserId) {
        const head = await req.models.User.findOne({ _id: headUserId, department: dept._id, role: "staff" });
        if (!head) {
          return res.status(400).json({ success: false, message: "headUserId must be a staff member of this department" });
        }
      }
      dept.headUserId = headUserId || null;
    }
    if (slaThresholdHours !== undefined) dept.slaThresholdHours = slaThresholdHours;
    await dept.save();
    res.json({ success: true, department: dept });
  } catch (error) {
    console.error("updateDepartment error:", error);
    res.status(500).json({ success: false, message: "Failed to update department" });
  }
};

export const deleteDepartment = async (req, res) => {
  const { id } = req.params;
  try {
    const dept = await req.models.Department.findById(id);
    if (!dept) return res.status(404).json({ success: false, message: "Department not found" });
    dept.isActive = false;
    await dept.save();
    res.json({ success: true, message: "Department deactivated" });
  } catch (error) {
    console.error("deleteDepartment error:", error);
    res.status(500).json({ success: false, message: "Failed to delete department" });
  }
};
