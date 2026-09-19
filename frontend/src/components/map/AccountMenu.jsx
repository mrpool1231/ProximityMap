import { Button } from "@/components/ui/button";
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger, DropdownMenuLabel, DropdownMenuSeparator } from "@/components/ui/dropdown-menu";
import { UserRound, LogOut, Palette, Sparkles } from "lucide-react";
import { useAuth } from "@/context/AuthContext";
import { toast } from "sonner";

export default function AccountMenu({ onSignIn, onBranding }) {
  const { user, logout } = useAuth();

  if (user === null) return <div className="h-9 w-24 animate-pulse rounded-md bg-slate-800/60" />;

  if (!user) {
    return (
      <Button
        variant="outline"
        size="sm"
        onClick={onSignIn}
        className="h-9 border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/40 hover:bg-sky-400/5 hover:text-sky-300"
        data-testid="sign-in-button"
      >
        <UserRound size={13} className="mr-2" /> Sign in
      </Button>
    );
  }

  return (
    <DropdownMenu>
      <DropdownMenuTrigger asChild>
        <Button variant="outline" size="sm" className="h-9 border-white/10 bg-slate-900/60 text-slate-200 hover:border-sky-400/40 hover:bg-sky-400/5" data-testid="account-menu-button">
          <span className="mr-2 flex h-5 w-5 items-center justify-center rounded-full bg-sky-400/20 font-mono text-[10px] uppercase text-sky-300">{user.name?.[0] || "?"}</span>
          <span className="max-w-[110px] truncate">{user.name}</span>
        </Button>
      </DropdownMenuTrigger>
      <DropdownMenuContent align="end" className="w-56 border-white/10 bg-[#0b0f17] text-slate-100">
        <DropdownMenuLabel className="text-[10px] font-mono uppercase tracking-widest text-slate-400">
          <div className="truncate normal-case tracking-normal text-slate-200" data-testid="account-email">{user.email}</div>
          {user.is_pro && (
            <span className="mt-1 inline-flex items-center gap-1 text-amber-300">
              <Sparkles size={10} /> Pro on all devices
            </span>
          )}
        </DropdownMenuLabel>
        <DropdownMenuSeparator className="bg-white/10" />
        <DropdownMenuItem onClick={onBranding} className="cursor-pointer text-sm hover:bg-slate-800 focus:bg-slate-800 focus:text-sky-300" data-testid="branding-menu-item">
          <Palette size={13} className="mr-2" /> Brief branding
        </DropdownMenuItem>
        <DropdownMenuItem
          onClick={async () => {
            await logout();
            toast.success("Signed out");
          }}
          className="cursor-pointer text-sm hover:bg-slate-800 focus:bg-slate-800 focus:text-red-300"
          data-testid="sign-out-menu-item"
        >
          <LogOut size={13} className="mr-2" /> Sign out
        </DropdownMenuItem>
      </DropdownMenuContent>
    </DropdownMenu>
  );
}
