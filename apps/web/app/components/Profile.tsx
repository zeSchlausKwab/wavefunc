import Image from "next/image";

interface ProfileProps {
  name: string;
  email: string;
  avatarUrl: string;
}

export function Profile({ name, email, avatarUrl }: ProfileProps) {
  return (
    <div className="flex items-center space-x-4">
      <div className="relative w-10 h-10">
        <Image
          src={avatarUrl || "/placeholder.svg"}
          alt={name}
          fill
          style={{ objectFit: "cover" }}
          className="rounded-full"
        />
      </div>
      <div className="hidden md:block">
        <p className="text-sm font-semibold text-primary font-press-start-2p">
          {name}
        </p>
        <p className="text-xs text-muted-foreground font-press-start-2p">
          {email}
        </p>
      </div>
    </div>
  );
}
