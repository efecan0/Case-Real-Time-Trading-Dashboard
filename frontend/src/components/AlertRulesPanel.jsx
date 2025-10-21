"use client";
import { useEffect, useState } from "react";
import { useWebSocket } from "@/lib/WebSocketContext";

/**
 * AlertRulesPanel — kullanıcı tanımlı uyarı kurallarını gösterir.
 * UML: AlertRule { ruleId, metricKey, operator, threshold, enabled }
 *      AlertEvent { eventId, ruleId, ts, value, message }
 */

export default function AlertRulesPanel() {
  const { alerts, registerAlert, disableAlert, getAlertsData, toast, setToast } = useWebSocket();
  const [rules, setRules] = useState([]);
  const [newRule, setNewRule] = useState({
    metricKey: "latencyMs",
    operator: ">",
    threshold: 50,
    enabled: true,
  });
  const [addError, setAddError] = useState(null);

  useEffect(() => {
    // Load alerts data on mount
    getAlertsData();
  }, [getAlertsData]);

  // Update rules from WebSocket alerts data
  useEffect(() => {
    if (alerts && typeof alerts === 'object') {
      console.log('🔍 AlertRulesPanel received alerts data:', alerts);
      
      setRules(prevRules => {
        const newRules = Object.entries(alerts).map(([key, alert]) => {
          // Determine operator and metric key based on alert type
          let operator = ">";
          let metricKey = key;
          let ruleId = key;
          
          // Handle built-in alerts and custom rules differently
          if (key === 'low_throughput') {
            operator = "<";
            metricKey = 'throughput';
          } else if (key === 'high_latency') {
            metricKey = 'latencyMs';
          } else if (key === 'error_rate') {
            metricKey = 'errorRate';
          } else if (key === 'connection_count') {
            metricKey = 'connCount';
          } else if (alert.ruleId) {
            // Custom rule with ruleId field
            ruleId = alert.ruleId;
            // Extract metric info from message or use defaults
            if (alert.message && alert.message.includes('latency')) {
              metricKey = 'latencyMs';
            } else if (alert.message && alert.message.includes('throughput')) {
              metricKey = 'throughput';
            } else if (alert.message && alert.message.includes('error')) {
              metricKey = 'errorRate';
            } else if (alert.message && alert.message.includes('connection')) {
              metricKey = 'connCount';
            }
            // Try to extract operator from message
            if (alert.message && alert.message.includes('>=')) {
              operator = '>=';
            } else if (alert.message && alert.message.includes('>')) {
              operator = '>';
            } else if (alert.message && alert.message.includes('<=')) {
              operator = '<=';
            } else if (alert.message && alert.message.includes('<')) {
              operator = '<';
            } else if (alert.message && alert.message.includes('==')) {
              operator = '==';
            }
          }
          
          // Find existing rule to preserve enabled state
          const existingRule = prevRules.find(r => r.ruleId === ruleId);
          
          return {
            ruleId: ruleId,
            metricKey: metricKey,
            operator: operator,
            threshold: alert.threshold || 0,
            enabled: existingRule ? existingRule.enabled : true, // Preserve enabled state or default to true
            current: alert.current || 0,
            status: alert.status || 'ok',
            message: alert.message || `${metricKey} alert`,
            timestamp: alert.timestamp
          };
        });
        
        console.log('📊 Processed alert rules:', newRules);
        return newRules;
      });
    }
  }, [alerts]);

  const handleAddRule = (e) => {
    e.preventDefault();
    
    // Clear previous errors
    setAddError(null);
    
    // Validation
    if (!newRule.metricKey.trim()) {
      const errorMsg = 'Metric key is required';
      console.error('❌', errorMsg);
      setAddError(errorMsg);
      setToast({
        type: 'error',
        message: errorMsg
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    if (!newRule.threshold || newRule.threshold <= 0) {
      const errorMsg = 'Valid threshold is required (must be > 0)';
      console.error('❌', errorMsg);
      setAddError(errorMsg);
      setToast({
        type: 'error',
        message: errorMsg
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    const ruleId = `custom_${newRule.metricKey}_${Date.now()}`;
    
    console.log('📤 Adding new alert rule:', {
      ruleId,
      metricKey: newRule.metricKey,
      operator: newRule.operator,
      threshold: parseFloat(newRule.threshold),
      enabled: newRule.enabled
    });
    
    // Add to local state immediately for UI feedback
    const newRuleData = {
      ruleId,
      metricKey: newRule.metricKey,
      operator: newRule.operator,
      threshold: parseFloat(newRule.threshold),
      enabled: newRule.enabled,
      current: 0, // Will be updated when server responds
      status: 'ok',
      message: `Custom rule: ${newRule.metricKey} ${newRule.operator} ${newRule.threshold}`
    };
    
    // Check if rule already exists before adding
    const exists = rules.some(r => 
      r.metricKey === newRule.metricKey && 
      r.operator === newRule.operator && 
      Math.abs(r.threshold - parseFloat(newRule.threshold)) < 0.001
    );
    
    if (exists) {
      const errorMsg = 'Similar rule already exists';
      console.warn('⚠️', errorMsg);
      setAddError(errorMsg);
      setToast({
        type: 'error',
        message: errorMsg
      });
      setTimeout(() => setToast(null), 3000);
      return;
    }
    
    // Add to local state immediately for UI feedback
    setRules(prevRules => {
      console.log('✅ Adding new rule to local state:', newRuleData);
      return [newRuleData, ...prevRules];
    });
    
    // Register alert rule via WebSocket
    registerAlert(
      ruleId,
      newRule.metricKey,
      newRule.operator,
      parseFloat(newRule.threshold),
      newRule.enabled
    );
    
    // Show success message
    setToast({
      type: 'success',
      message: `Alert rule "${ruleId}" added successfully`
    });
    setTimeout(() => setToast(null), 3000);
    
    // Reset form and clear errors
    setNewRule({ metricKey: "latencyMs", operator: ">", threshold: 50, enabled: true });
    setAddError(null);
  };

  const toggleRule = (ruleId) => {
    // Find the rule to toggle
    const rule = rules.find(r => r.ruleId === ruleId);
    if (!rule) {
      console.error('❌ Rule not found:', ruleId);
      return;
    }
    
    console.log('🔄 Toggling rule:', ruleId, 'current enabled:', rule.enabled);
    
    // Update local state first for immediate UI feedback
    setRules(prevRules => 
      prevRules.map(r => 
        r.ruleId === ruleId ? { ...r, enabled: !r.enabled } : r
      )
    );
    
    if (rule.enabled) {
      // Disable the rule
      console.log('📤 Disabling alert rule:', ruleId);
      disableAlert(ruleId);
    } else {
      // Re-enable the rule
      console.log('📤 Re-enabling alert rule:', ruleId, 'with params:', {
        ruleId,
        metricKey: rule.metricKey,
        operator: rule.operator,
        threshold: rule.threshold
      });
      registerAlert(
        ruleId,
        rule.metricKey,
        rule.operator,
        rule.threshold,
        true
      );
    }
  };

  return (
    <div className="glass p-4 rounded-lg border border-white/10">
      <h3 className="text-sm font-semibold mb-3">Alert Rules</h3>

      <form onSubmit={handleAddRule} className="flex flex-wrap gap-2 items-center mb-4 text-sm">
        <select
          value={newRule.metricKey}
          onChange={(e) => setNewRule({ ...newRule, metricKey: e.target.value })}
          className="bg-transparent border border-white/10 rounded px-2 py-1"
        >
          <option value="latencyMs">Latency (ms)</option>
          <option value="throughput">Throughput (tx/s)</option>
          <option value="errorRate">Error Rate (decimal)</option>
          <option value="connCount">Connection Count</option>
        </select>

        <select
          value={newRule.operator}
          onChange={(e) => setNewRule({ ...newRule, operator: e.target.value })}
          className="bg-transparent border border-white/10 rounded px-2 py-1"
        >
          <option value=">">&gt; (Greater than)</option>
          <option value=">=">&gt;= (Greater than or equal)</option>
          <option value="<">&lt; (Less than)</option>
          <option value="<=">&lt;= (Less than or equal)</option>
          <option value="==">== (Equal to)</option>
        </select>

        <input
          type="number"
          step="0.1"
          min="0"
          value={newRule.threshold}
          onChange={(e) => setNewRule({ ...newRule, threshold: parseFloat(e.target.value) || 0 })}
          placeholder="Threshold"
          className="bg-transparent border border-white/10 rounded px-2 py-1 w-20"
        />

        <button
          type="submit"
          className="px-3 py-1 rounded-md bg-green-500 text-black font-semibold hover:bg-green-400 transition"
        >
          Add
        </button>
      </form>

      {addError && (
        <div className="text-xs text-red-400 mt-2 p-2 bg-red-500/10 border border-red-500/20 rounded">
          ⚠️ {addError}
        </div>
      )}

      <div className="overflow-x-auto">
        <table className="w-full text-sm border-collapse">
          <thead>
            <tr className="text-gray-400 border-b border-white/10 text-xs">
              <th className="text-left py-2 px-1">ID</th>
              <th className="text-left py-2 px-1">Metric</th>
              <th className="text-left py-2 px-1">Condition</th>
              <th className="text-left py-2 px-1">Status</th>
              <th className="text-left py-2 px-1">Action</th>
            </tr>
          </thead>
          <tbody>
            {rules.map((r) => (
              <tr
                key={r.ruleId}
                className="border-b border-white/5 hover:bg-white/5 transition"
              >
                <td className="py-2 px-1 text-xs text-gray-400">{r.ruleId}</td>
                <td className="py-2 px-1">{r.metricKey}</td>
                <td className="py-2 px-1">
                  {r.operator} {r.threshold}
                </td>
                <td
                  className={`py-2 px-1 font-medium ${
                    r.enabled ? "text-green-400" : "text-gray-400"
                  }`}
                >
                  {r.enabled ? "Active" : "Inactive"}
                </td>
                <td className="py-2 px-1">
                  <button
                    onClick={() => toggleRule(r.ruleId)}
                    className="text-xs px-2 py-1 rounded border border-white/10 hover:bg-white/10"
                  >
                    {r.enabled ? "Disable" : "Enable"}
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {!rules.length && (
        <div className="text-xs text-gray-500 mt-2">No rules yet.</div>
      )}
    </div>
  );
}
