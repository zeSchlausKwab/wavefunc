"use client";

export function DevelopmentControls() {
  // Only render in development mode
  if (process.env.NEXT_PUBLIC_APP_ENV !== "development") {
    return null;
  }

  const callDevEndpoint = async (endpoint: string) => {
    console.log(
      "Calling development endpoint:",
      `http://${process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP}:${process.env.NEXT_PUBLIC_API_PORT}/development/${endpoint}`
    );
    try {
      const response = await fetch(
        `http://${process.env.NEXT_PUBLIC_LOCAL_MACHINE_IP}:${process.env.NEXT_PUBLIC_API_PORT}/development/${endpoint}`,
        {
          method: "POST",
        }
      );
      const data = await response.json();
      alert(data.message);
    } catch (error) {
      console.error("Error:", error);
      alert("Failed to call development endpoint");
    }
  };

  return (
    <div className="fixed bottom-20 right-4 flex flex-col gap-2 bg-white p-4 rounded-lg shadow-lg border">
      <h2 className="font-bold mb-2">Development Controls</h2>
      <button
        onClick={() => callDevEndpoint("seed")}
        className="px-4 py-2 bg-green-500 text-white rounded hover:bg-green-600"
      >
        Seed Data
      </button>
      <button
        onClick={() => callDevEndpoint("nuke")}
        className="px-4 py-2 bg-red-500 text-white rounded hover:bg-red-600"
      >
        Nuke Data
      </button>
      <button
        onClick={() => callDevEndpoint("reset")}
        className="px-4 py-2 bg-blue-500 text-white rounded hover:bg-blue-600"
      >
        Reset Data
      </button>
    </div>
  );
}
