import { isWorkEmail } from "./employeeSignup";

// These roles and external approvals come from protected membership columns,
// never signup metadata. Personal-email exceptions require the owner's action.
export function accountPermissions(member, userId) {
  const currentMember = member && userId && member.user_id === userId && member.access_enabled !== false && member.registration_complete !== false ? member : null;
  const role = isWorkEmail(currentMember?.email) || currentMember?.external_role_approved === true ? currentMember?.role : "viewer";
  return {
    member: currentMember,
    canEdit: ["admin", "estimator"].includes(role),
    isAdmin: role === "admin",
    isOwner: role === "admin" && currentMember?.is_owner === true,
  };
}
