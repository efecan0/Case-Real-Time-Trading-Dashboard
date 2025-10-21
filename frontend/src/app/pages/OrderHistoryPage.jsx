import OrderHistoryPanel from "../../components/OrderHistoryPanel";

export default function OrderHistoryPage() {
  return (
    <div className="p-6 space-y-6 w-full max-w-full overflow-x-hidden">
      <div>
        <h2 className="text-lg font-semibold">Order History</h2>
        <p className="text-xs text-gray-400">Latest trade executions and status updates.</p>
      </div>
      <div className="w-full">
        <OrderHistoryPanel title="Recent Orders" notice="Shows the last 10 recorded orders." />
      </div>
    </div>
  );
}
