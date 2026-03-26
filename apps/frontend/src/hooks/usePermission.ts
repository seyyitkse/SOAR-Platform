import { useAuthStore, RolePermissions } from '@/lib/store';

export function usePermission(permission: keyof RolePermissions): boolean {
  const user = useAuthStore((s) => s.user);
  if (!user) return false;
  return user.permissions[permission] === true;
}
