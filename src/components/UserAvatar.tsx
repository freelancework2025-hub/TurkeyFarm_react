import { User } from "lucide-react";
import { useProfileImage } from "@/hooks/useProfileImage";

interface UserAvatarProps {
  userId: number;
  /** When false, skips requesting profile-image (avoids 404 for users without photo) */
  hasProfileImage?: boolean;
  refreshKey?: number;
  className?: string;
  size?: "sm" | "md" | "lg";
}

const sizeClasses = { sm: "w-8 h-8", md: "w-10 h-10", lg: "w-12 h-12" };
const iconSizes = { sm: "w-4 h-4", md: "w-5 h-5", lg: "w-6 h-6" };

export function UserAvatar({ userId, hasProfileImage = true, refreshKey = 0, className = "", size = "md" }: UserAvatarProps) {
  const profileImageUrl = useProfileImage(hasProfileImage ? userId : null, refreshKey);

  return (
    <div
      className={`${sizeClasses[size]} rounded-full overflow-hidden bg-muted border border-border flex items-center justify-center shrink-0 ${className}`}
    >
      {profileImageUrl ? (
        <img src={profileImageUrl} alt="" className="w-full h-full object-cover" />
      ) : (
        <User className={`${iconSizes[size]} text-muted-foreground`} />
      )}
    </div>
  );
}
