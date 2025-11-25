import { useEffect, useState } from "react";

export default function BlockedUsers() {
  const [blockedUsers, setBlockedUsers] = useState([]);

  const fetchBlocked = async () => {
    try {
      const res = await fetch("http://localhost:5000/api/blocked-users");
      const data = await res.json();
      setBlockedUsers(data);
    } catch (err) {
      console.error(err);
      alert("Failed to fetch blocked users.");
    }
  };

  const unblockUser = async (email) => {
    if (!window.confirm(`Unblock ${email}?`)) return;

    try {
      const res = await fetch("http://localhost:5000/api/unblock-user", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });

      const data = await res.json();
      alert(data.message);
      fetchBlocked();
    } catch (err) {
      console.error(err);
      alert("Failed to unblock user.");
    }
  };

  useEffect(() => {
    fetchBlocked();
  }, []);

  return (
    <div style={{ padding: "20px" }}>
      <h1>🚫 Blocked Users</h1>

      {blockedUsers.length === 0 ? (
        <p>No blocked users 🎉</p>
      ) : (
        <table style={{ width: "100%", borderCollapse: "collapse" }}>
          <thead>
            <tr style={{ background: "#f2f2f2" }}>
              <th style={{ padding: "10px", border: "1px solid #ddd" }}>Name</th>
              <th style={{ padding: "10px", border: "1px solid #ddd" }}>Email</th>
              <th style={{ padding: "10px", border: "1px solid #ddd" }}>Reason</th>
              <th style={{ padding: "10px", border: "1px solid #ddd" }}>Blocked At</th>
              <th style={{ padding: "10px", border: "1px solid #ddd" }}>Action</th>
            </tr>
          </thead>

          <tbody>
            {blockedUsers.map((u, index) => (
              <tr key={index}>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>
                  {u.name || "Unknown"}
                </td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>
                  {u.email}
                </td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>
                  {u.blockedReason}
                </td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>
                  {new Date(u.blockedAt).toLocaleString()}
                </td>
                <td style={{ padding: "10px", border: "1px solid #ddd" }}>
                  <button
                    onClick={() => unblockUser(u.email)}
                    style={{
                      padding: "6px 12px",
                      background: "green",
                      color: "white",
                      border: "none",
                      borderRadius: "5px",
                      cursor: "pointer",
                    }}
                  >
                    Unblock
                  </button>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}
