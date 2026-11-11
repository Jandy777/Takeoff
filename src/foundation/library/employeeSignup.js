export const EMPLOYEES = [
  { id: "hector-reyes", name: "Hector Reyes" },
  { id: "don-baggio", name: "Don Baggio" },
  { id: "steve-martin", name: "Steve Martin" },
  { id: "scott-martin", name: "Scott Martin" },
  { id: "chuck-atkinson", name: "Chuck Atkinson" },
  { id: "randy-guenther", name: "Randy Guenther" },
  { id: "eric-oneil", name: "Eric O'Neil" },
];

export const isWorkEmail = (email) => /^[^\s@]+@concretews\.com$/i.test(String(email || "").trim());

export function employeeSignupData(email, employeeId) {
  if (!EMPLOYEES.some((employee) => employee.id === employeeId)) throw new Error("Choose your name from the employee list.");
  if (!isWorkEmail(email)) throw new Error("Use your @concretews.com work email to create an employee account. Other email addresses can register for view-only access.");
  // A request for the administrator to review, never a client-supplied role.
  return { employee_id: employeeId };
}
