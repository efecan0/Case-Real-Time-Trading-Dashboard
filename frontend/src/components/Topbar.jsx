export default function Topbar() {
return (
<>
<div className="flex items-center gap-4">
<button className="md:hidden p-2 rounded-md border border-white/10">☰</button>
<div>
<h2 className="text-lg font-semibold">Control Panel</h2>
<p className="text-xs text-gray-400">Real-time market data and system status</p>
</div>
</div>
<div className="flex items-center gap-4">
<div className="text-right">
<div className="text-xs text-gray-400">User</div>
<div className="font-medium">Trader_01</div>
</div>
<div className="w-10 h-10 rounded-full bg-white/5 flex items-center justify-center">A</div>
</div>
</>
);
}