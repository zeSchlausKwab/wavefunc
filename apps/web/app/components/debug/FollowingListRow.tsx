import type { NDKUser } from '@nostr-dev-kit/ndk'
import { TableCell, TableRow } from '@/components/ui/table'
import { Skeleton } from '@/components/ui/skeleton'
import { Avatar, AvatarImage, AvatarFallback } from '@/components/ui/avatar'

type ProfileData = {
  profile: NDKUser | null
  loading: boolean
}

interface FollowingListRowProps {
  pubkey: string
  profileData: ProfileData | undefined
}

const ProfileCell = ({ pubkey, profile }: { pubkey: string; profile: NDKUser | null }) => (
  <div className="flex items-center space-x-4">
    <Avatar>
      <AvatarImage src={profile?.profile?.image} alt={profile?.profile?.name || 'Unknown'} />
      <AvatarFallback>{profile?.profile?.name?.[0] || '?'}</AvatarFallback>
    </Avatar>
    <div>
      <div className="font-medium">{profile?.profile?.name || 'Anonymous'}</div>
      <div className="text-sm text-muted-foreground font-mono">{pubkey.slice(0, 8)}...</div>
    </div>
  </div>
)

const LoadingProfileCell = () => (
  <div className="flex items-center space-x-4">
    <Skeleton className="h-12 w-12 rounded-full" />
    <div className="space-y-2">
      <Skeleton className="h-4 w-[150px]" />
      <Skeleton className="h-4 w-[100px]" />
    </div>
  </div>
)

export function FollowingListRow({ pubkey, profileData }: FollowingListRowProps) {
  if (!profileData || profileData.loading) {
    return (
      <TableRow>
        <TableCell>
          <LoadingProfileCell />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-20" />
        </TableCell>
        <TableCell>
          <Skeleton className="h-4 w-full" />
        </TableCell>
      </TableRow>
    )
  }

  return (
    <TableRow>
      <TableCell>
        <ProfileCell pubkey={pubkey} profile={profileData.profile} />
      </TableCell>
      <TableCell>{profileData.profile?.profile?.nip05 || '-'}</TableCell>
      <TableCell className="max-w-md truncate">{profileData.profile?.profile?.about || '-'}</TableCell>
    </TableRow>
  )
}
