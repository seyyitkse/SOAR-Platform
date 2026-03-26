import { useAuthStore, RolePermissions } from '@/lib/store';
import { useRouter } from 'next/navigation';
import { useCallback } from 'react';

export function useAuth() {
  const { user, accessToken, clearAuth } = useAuthStore();
  const router = useRouter();

  const isAuthenticated = !!user && !!accessToken;

  const hasPermission = useCallback(
    (permission: keyof RolePermissions): boolean => {
      if (!user) return false;
      return user.permissions[permission] === true;
    },
    [user],
  );

  const logout = useCallback(() => {
    clearAuth();
    router.push('/login');
  }, [clearAuth, router]);

  return {
    user,
    isAuthenticated,
    hasPermission,
    logout,
  };
}
