import { useState } from "react";
import { Package, Plane, Plus } from "lucide-react";
import { useStore } from "../store";
import { plural } from "../time";
import { Empty } from "../components/ui";

/**
 * The kinds of aircraft in the fleet (picked on each tail, and what crew are rated on) and the
 * equipment they can carry for different work: a hoist for rescue, a bucket for fire. Missions say
 * which equipment they need, and a tail booked without it shows as a problem.
 */

type Tab = "types" | "equipment";

export function TypesPage() {
  const { data, open } = useStore();
  const [tab, setTab] = useState<Tab>("types");
  const types = [...data.aircraftTypes].sort((a, b) => a.name.localeCompare(b.name));
  const equipment = [...data.equipment].sort((a, b) => a.name.localeCompare(b.name));
  const nameOf = (id: string) => data.equipment.find((e) => e.id === id)?.name;

  return (
    <>
      <div className="page-head">
        <h1>Types & equipment</h1>
        <button className={`btn ${tab === "types" ? "" : "primary"}`} onClick={() => open("equipment", "new")}><Plus size={16} /> Add equipment…</button>
        <button className={`btn ${tab === "types" ? "primary" : ""}`} onClick={() => open("aircraftType", "new")}><Plus size={16} /> Add type…</button>
      </div>
      <div className="row gap wrap" style={{ marginBottom: 14 }}>
        <div className="seg">
          <button className={tab === "types" ? "active" : ""} onClick={() => setTab("types")}>Aircraft types <span className="chip">{types.length}</span></button>
          <button className={tab === "equipment" ? "active" : ""} onClick={() => setTab("equipment")}>Equipment <span className="chip">{equipment.length}</span></button>
        </div>
      </div>

      {tab === "types" && (types.length === 0 ? (
        <Empty icon={<Plane size={28} />} text="Add the kinds of aircraft you fly, like Bell 412 or AS350. Each tail picks its type, and crew are rated on types."
          action={<button className="btn primary" onClick={() => open("aircraftType", "new")}>Add type…</button>} />
      ) : (
        <>
          <p className="muted" style={{ marginTop: -8 }}>Each tail on the Fleet page picks one of these. Crew are rated on types, and each type lists the equipment its tails can carry.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Type</th><th className="r">Pilot seats</th><th>Tails</th><th className="r">Pilots rated</th><th className="r">Maintainers rated</th><th>Equipment it can carry</th></tr></thead>
              <tbody>
                {types.map((t) => {
                  const tails = data.aircraft.filter((a) => a.type === t.name && a.status !== "Retired");
                  const rated = (role: string) => data.people.filter((p) => p.role === role && p.quals.includes(t.name)).length;
                  return (
                    <tr key={t.id} onClick={() => open("aircraftType", t.id)}>
                      <td className="name">{t.name}</td>
                      <td className="r">{t.seats}</td>
                      <td>{tails.length ? <span className="mono">{tails.map((a) => a.tail).join(", ")}</span> : <span className="muted">None</span>}</td>
                      <td className="r">{rated("Pilot")}</td>
                      <td className="r">{rated("Maintainer")}</td>
                      <td>{t.equipmentIds.length ? t.equipmentIds.map(nameOf).filter(Boolean).join(", ") : <span className="muted">{data.equipment.length ? "Any" : "None set up"}</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cards-list">
            {types.map((t) => {
              const tails = data.aircraft.filter((a) => a.type === t.name && a.status !== "Retired");
              return (
                <button key={t.id} className="list-card" onClick={() => open("aircraftType", t.id)}>
                  <b>{t.name}</b>
                  <span className="small muted">{plural(tails.length, "tail")} · {plural(t.seats, "pilot seat")}</span>
                  {t.equipmentIds.length > 0 && <span className="small">{t.equipmentIds.map(nameOf).filter(Boolean).join(", ")}</span>}
                </button>
              );
            })}
          </div>
        </>
      ))}

      {tab === "equipment" && (equipment.length === 0 ? (
        <Empty icon={<Package size={28} />} text="Add what your aircraft carry for different work, like a rescue hoist, a fire bucket or a medical interior. Clients pick what they need."
          action={<button className="btn primary" onClick={() => open("equipment", "new")}>Add equipment…</button>} />
      ) : (
        <>
          <p className="muted" style={{ marginTop: -8 }}>Tick what each tail has on its Fleet form, and what each client needs on its Equipment tab. A tail booked on a job without it shows as a problem.</p>
          <div className="table-wrap">
            <table className="table">
              <thead><tr><th>Equipment</th><th>Fits</th><th>On tails</th><th>Clients that need it</th></tr></thead>
              <tbody>
                {equipment.map((e) => {
                  const fits = data.aircraftTypes.filter((t) => t.equipmentIds.includes(e.id)).map((t) => t.name);
                  const tails = data.aircraft.filter((a) => (a.equipmentIds ?? []).includes(e.id) && a.status !== "Retired");
                  const missions = data.missions.filter((m) => (m.requiredEquipmentIds ?? []).includes(e.id));
                  return (
                    <tr key={e.id} onClick={() => open("equipment", e.id)}>
                      <td className="name">{e.name}</td>
                      <td>{fits.length ? fits.join(", ") : <span className="muted">Any type</span>}</td>
                      <td>{tails.length ? <span className="mono">{tails.map((a) => a.tail).join(", ")}</span> : <span className="muted">None</span>}</td>
                      <td>{missions.length ? missions.map((m) => m.name).join(", ") : <span className="muted">None</span>}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          <div className="cards-list">
            {equipment.map((e) => {
              const tails = data.aircraft.filter((a) => (a.equipmentIds ?? []).includes(e.id) && a.status !== "Retired");
              const missions = data.missions.filter((m) => (m.requiredEquipmentIds ?? []).includes(e.id));
              return (
                <button key={e.id} className="list-card" onClick={() => open("equipment", e.id)}>
                  <b>{e.name}</b>
                  <span className="small muted">On {tails.length ? tails.map((a) => a.tail).join(", ") : "no tails"} · needed by {plural(missions.length, "client")}</span>
                </button>
              );
            })}
          </div>
        </>
      ))}
    </>
  );
}
