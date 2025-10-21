import { useLocation, Link } from "react-router-dom";
import ConnectionStatus from "./ConnectionStatus";

const navItems = [
  { href: "/", label: "Market Data" },
  { href: "/performance", label: "Performance" },
  { href: "/order-history", label: "Order History" },
];

export default function Sidebar() {
  const location = useLocation();

  return (
    <div>
      <div className="mb-8">
        <h1 className="text-2xl font-semibold text-white">HFT Dashboard</h1>
        <p className="text-xs text-gray-400 mt-1">Real-time market & system monitoring</p>
      </div>

      <nav className="space-y-1">
        {navItems.map((item) => {
          const isActive = location.pathname === item.href;
          return (
            <Link
              key={item.href}
              to={item.href}
              className={`flex items-center gap-3 p-3 rounded-md border border-white/5 transition hover:bg-white/10 ${
                isActive ? "bg-white/10" : ""
              }`}
            >
              <span className="font-medium">{item.label}</span>
            </Link>
          );
        })}
      </nav>

      <div className="mt-8">
        <h3 className="text-xs text-gray-400 uppercase tracking-wide">Connection</h3>
        <div className="mt-3 flex items-center gap-3">
          <span className="inline-block h-3 shadow" />
          <div>
            <ConnectionStatus />
          </div>
        </div>
      </div>
    </div>
  );
}
