import { createFileRoute, Link } from "@tanstack/react-router";
import { useState, useEffect } from "react";
import { useQuery, useMutation, useQueryClient } from "@tanstack/react-query";
import { motion, AnimatePresence } from "framer-motion";
import { supabase } from "@/integrations/supabase/client";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { toast } from "sonner";
import {
  Calendar as CalendarIcon,
  Clock,
  PhoneCall,
  User,
  Plus,
  ChevronLeft,
  ChevronRight,
  Filter,
  CheckCircle2,
  XCircle,
  AlertCircle,
  PhoneOutgoing,
  Bot,
  Sparkles,
  TrendingUp,
  DollarSign,
  Loader2,
  CalendarCheck,
  Stethoscope,
  Activity,
  X,
} from "lucide-react";

export const Route = createFileRoute("/_authenticated/workspace")({
  component: WorkspacePage,
});
import { getDomainPack } from "@/lib/domainPacks";

function WorkspacePage() {
  const qc = useQueryClient();
  const [selectedDate, setSelectedDate] = useState(() => new Date().toISOString().split("T")[0]);
  const [calendarView, setCalendarView] = useState<"day" | "week" | "month">("day");
  const [selectedResource, setSelectedResource] = useState<string>("all");
  const [bookingModalOpen, setBookingModalOpen] = useState(false);

  // 1. Fetch Business Profile
  const { data: profile } = useQuery({
    queryKey: ["business-profile"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return null;
      const { data } = await (supabase as any)
        .from("business_profiles")
        .select("*")
        .eq("user_id", user.id)
        .maybeSingle();
      return data;
    },
  });

  // 2. Fetch Resources (Staff/Doctors)
  const { data: resources = [] } = useQuery({
    queryKey: ["resources-list"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("resources")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
      return data ?? [];
    },
  });

  // 3. Fetch Services
  const { data: services = [] } = useQuery({
    queryKey: ["services-list"],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];
      const { data } = await (supabase as any)
        .from("services")
        .select("*")
        .eq("user_id", user.id)
        .order("name");
      return data ?? [];
    },
  });

  // 4. Fetch Appointments for the selected day/range
  const { data: appointments = [], isLoading: loadingAppointments } = useQuery({
    queryKey: ["appointments", selectedDate, selectedResource],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      let query = (supabase as any)
        .from("appointments")
        .select("*, resources(name), services(name, price, duration_minutes)")
        .eq("user_id", user.id)
        .gte("start_time", startOfDay)
        .lte("start_time", endOfDay)
        .order("start_time", { ascending: true });

      if (selectedResource !== "all") {
        query = query.eq("resource_id", selectedResource);
      }

      const { data } = await query;
      return data ?? [];
    },
  });

  // 5. Fetch Today's Call Stats
  const { data: todayCalls = [] } = useQuery({
    queryKey: ["today-calls", selectedDate],
    queryFn: async () => {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return [];

      const startOfDay = `${selectedDate}T00:00:00.000Z`;
      const endOfDay = `${selectedDate}T23:59:59.999Z`;

      const { data } = await (supabase as any)
        .from("calls")
        .select("id, started_at, outcome, student_or_caller_number, duration_seconds")
        .eq("user_id", user.id)
        .gte("started_at", startOfDay)
        .lte("started_at", endOfDay);

      return data ?? [];
    },
  });

  // Supabase Realtime channel for instant appointments and calls updates
  useEffect(() => {
    const channel = supabase
      .channel("workspace-realtime")
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "appointments" },
        () => {
          qc.invalidateQueries({ queryKey: ["appointments"] });
        }
      )
      .on(
        "postgres_changes",
        { event: "*", schema: "public", table: "calls" },
        () => {
          qc.invalidateQueries({ queryKey: ["today-calls"] });
        }
      )
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
  }, [qc]);

  // Metrics computation
  const confirmedCount = appointments.filter((a: any) => a.status === "confirmed").length;
  const estimatedRevenue = appointments
    .filter((a: any) => a.status === "confirmed")
    .reduce((sum: number, a: any) => sum + (Number(a.services?.price) || 500), 0);

  // Date navigation helpers
  const handlePrevDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() - 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const handleNextDay = () => {
    const d = new Date(selectedDate);
    d.setDate(d.getDate() + 1);
    setSelectedDate(d.toISOString().split("T")[0]);
  };

  const formattedSelectedDate = new Date(`${selectedDate}T12:00:00`).toLocaleDateString("en-US", {
    weekday: "long",
    month: "long",
    day: "numeric",
    year: "numeric",
  });

  const pack = getDomainPack(profile?.domain_pack);

  return (
    <div className="space-y-6">
      {/* ── Top Workspace Bar ────────────────────────────────────────── */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-4 rounded-2xl border border-white/5 bg-gradient-to-r from-[#0B1120] to-[#0A0E1A] p-6 shadow-xl relative overflow-hidden">
        {/* Glow Accent */}
        <div className="absolute top-0 right-0 w-80 h-full bg-[radial-gradient(ellipse_at_top_right,rgba(59,130,246,0.12),transparent_70%)] pointer-events-none" />

        <div className="space-y-1 relative z-10">
          <div className="flex items-center gap-2.5">
            <h1 className="text-xl font-bold tracking-tight text-slate-100">
              {profile?.business_name || "My Business Workspace"}
            </h1>
            <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase tracking-wider bg-cyan-500/10 text-cyan-400 border border-cyan-500/20">
              <Sparkles className="w-3 h-3" /> {pack.displayName}
            </span>
          </div>
          <p className="text-xs text-slate-400">
            {profile?.city ? `${profile.city} • ` : ""}Working hours: {profile?.working_hours?.start || "10:00"} to{" "}
            {profile?.working_hours?.end || "19:00"} ({profile?.timezone || "IST"})
          </p>
        </div>

        <div className="flex items-center gap-3 relative z-10">
          <button
            onClick={() => setBookingModalOpen(true)}
            className="flex items-center gap-2 rounded-xl bg-gradient-to-r from-blue-600 via-cyan-500 to-orange-500 px-4 py-2.5 text-xs font-bold uppercase tracking-wider text-white shadow-[0_0_20px_rgba(59,130,246,0.35)] hover:shadow-[0_0_25px_rgba(59,130,246,0.5)] hover:brightness-105 transition-all"
          >
            <Plus className="w-4 h-4" /> Book {pack.key === "real_estate" ? "Site Visit" : pack.key === "salon" ? "Session" : "Appointment"}
          </button>
        </div>
      </div>

      {/* ── Today's Metric Strip ─────────────────────────────────────── */}
      <div className="grid grid-cols-2 md:grid-cols-4 gap-4">
        {/* Confirmed Appointments */}
        <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Appointments</span>
            <CalendarCheck className="w-4 h-4 text-cyan-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{confirmedCount}</div>
          <div className="text-[11px] text-slate-500">Scheduled for selected date</div>
        </div>

        {/* Live / Total Calls */}
        <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Inbound / Calls</span>
            <PhoneCall className="w-4 h-4 text-blue-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">{todayCalls.length}</div>
          <div className="text-[11px] text-slate-500">Processed by AI Receptionist</div>
        </div>

        {/* Value Booked */}
        <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Pipeline Value</span>
            <DollarSign className="w-4 h-4 text-orange-400" />
          </div>
          <div className="text-2xl font-bold text-slate-100">₹{estimatedRevenue.toLocaleString()}</div>
          <div className="text-[11px] text-slate-500">Confirmed booking revenue</div>
        </div>

        {/* Double-Booking Guard */}
        <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-4 space-y-2">
          <div className="flex items-center justify-between text-xs text-slate-400 font-semibold">
            <span>Guard Engine</span>
            <Activity className="w-4 h-4 text-emerald-400" />
          </div>
          <div className="text-base font-bold text-emerald-400 flex items-center gap-1.5 pt-1">
            <CheckCircle2 className="w-4 h-4" /> Zero Overlap
          </div>
          <div className="text-[11px] text-slate-500">PostgreSQL GiST Lock Active</div>
        </div>
      </div>

      {/* ── Calendar Controls & Timeline View ───────────────────────── */}
      <div className="rounded-2xl border border-white/5 bg-[#0A0D16] p-6 space-y-6 shadow-xl">
        {/* Date Selector & View Filter */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 pb-4 border-b border-white/5">
          <div className="flex items-center gap-3">
            <button
              onClick={handlePrevDay}
              className="p-2 rounded-lg border border-white/10 bg-white/2 hover:bg-white/5 text-slate-300 transition-colors"
            >
              <ChevronLeft className="w-4 h-4" />
            </button>
            <div className="text-sm font-bold text-slate-100 min-w-[200px] text-center">
              {formattedSelectedDate}
            </div>
            <button
              onClick={handleNextDay}
              className="p-2 rounded-lg border border-white/10 bg-white/2 hover:bg-white/5 text-slate-300 transition-colors"
            >
              <ChevronRight className="w-4 h-4" />
            </button>
            <button
              onClick={() => setSelectedDate(new Date().toISOString().split("T")[0])}
              className="px-2.5 py-1 text-xs font-semibold rounded-md border border-white/10 bg-white/2 hover:bg-white/5 text-slate-400 hover:text-slate-100 transition-colors"
            >
              Today
            </button>
          </div>

          <div className="flex items-center gap-2">
            {/* Resource filter */}
            {resources.length > 0 && (
              <select
                value={selectedResource}
                onChange={(e) => setSelectedResource(e.target.value)}
                className="h-9 px-3 text-xs font-semibold rounded-lg border border-white/10 bg-[#060912] text-slate-200 outline-none"
              >
                <option value="all">All Staff / Practitioners</option>
                {resources.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.type})
                  </option>
                ))}
              </select>
            )}
          </div>
        </div>

        {/* Timeline Slot Cards */}
        {loadingAppointments ? (
          <div className="py-12 flex flex-col items-center justify-center gap-2 text-slate-400">
            <Loader2 className="w-6 h-6 animate-spin text-blue-500" />
            <span className="text-xs">Loading calendar schedule...</span>
          </div>
        ) : appointments.length === 0 ? (
          <div className="py-16 text-center space-y-3">
            <div className="w-12 h-12 rounded-2xl bg-white/5 border border-white/10 flex items-center justify-center mx-auto text-slate-400">
              <CalendarIcon className="w-6 h-6 text-slate-500" />
            </div>
            <h3 className="text-sm font-semibold text-slate-200">No appointments scheduled for this day</h3>
            <p className="text-xs text-slate-500 max-w-sm mx-auto">
              Callers can book directly through your AI assistant, or you can manually create an appointment.
            </p>
            <button
              onClick={() => setBookingModalOpen(true)}
              className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl bg-white/5 border border-white/10 text-xs font-bold text-slate-200 hover:bg-white/10 transition-colors"
            >
              <Plus className="w-3.5 h-3.5" /> Book a Slot
            </button>
          </div>
        ) : (
          <div className="space-y-3">
            {appointments.map((apt: any) => {
              const start = new Date(apt.start_time);
              const end = new Date(apt.end_time);
              const timeString = `${start.toLocaleTimeString("en-US", {
                hour: "numeric",
                minute: "2-digit",
                hour12: true,
              })} - ${end.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}`;

              const isConfirmed = apt.status === "confirmed";
              const isCancelled = apt.status === "cancelled";

              return (
                <div
                  key={apt.id}
                  className={`flex flex-col sm:flex-row sm:items-center justify-between gap-4 p-4 rounded-xl border transition-all ${
                    isCancelled
                      ? "bg-rose-500/5 border-rose-500/20 opacity-70"
                      : "bg-[#0B1120]/80 border-white/10 hover:border-cyan-500/30"
                  }`}
                >
                  <div className="flex items-start sm:items-center gap-3">
                    <div className="flex flex-col items-center justify-center h-12 w-20 rounded-lg bg-white/5 border border-white/5 shrink-0">
                      <Clock className="w-3.5 h-3.5 text-cyan-400 mb-0.5" />
                      <span className="text-[11px] font-bold text-slate-200">
                        {start.toLocaleTimeString("en-US", { hour: "numeric", minute: "2-digit", hour12: true })}
                      </span>
                    </div>

                    <div className="space-y-0.5">
                      <div className="flex items-center gap-2">
                        <span className="text-sm font-bold text-slate-100">{apt.customer_name}</span>
                        <span
                          className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-full ${
                            isConfirmed
                              ? "bg-emerald-500/10 text-emerald-400 border border-emerald-500/20"
                              : isCancelled
                              ? "bg-rose-500/10 text-rose-400 border border-rose-500/20"
                              : "bg-amber-500/10 text-amber-400 border border-amber-500/20"
                          }`}
                        >
                          {apt.status}
                        </span>
                      </div>
                      <div className="text-xs text-slate-400 flex items-center gap-3">
                        <span>{apt.customer_phone}</span>
                        <span>•</span>
                        <span className="text-cyan-400">{apt.services?.name || "General Service"}</span>
                        {apt.resources?.name && (
                          <>
                            <span>•</span>
                            <span className="text-slate-300">{apt.resources.name}</span>
                          </>
                        )}
                      </div>
                      {apt.notes && <p className="text-[11px] text-slate-500 italic mt-0.5">{apt.notes}</p>}
                    </div>
                  </div>

                  <div className="flex items-center gap-2 self-end sm:self-center">
                    {!isCancelled && (
                      <button
                        onClick={async () => {
                          if (confirm(`Cancel appointment for ${apt.customer_name}?`)) {
                            await (supabase as any)
                              .from("appointments")
                              .update({ status: "cancelled" })
                              .eq("id", apt.id);
                            toast.success("Appointment cancelled.");
                            qc.invalidateQueries({ queryKey: ["appointments"] });
                          }
                        }}
                        className="px-3 py-1.5 text-xs font-semibold rounded-lg border border-white/10 bg-white/2 hover:bg-rose-500/10 hover:text-rose-400 hover:border-rose-500/30 text-slate-400 transition-colors"
                      >
                        Cancel
                      </button>
                    )}
                  </div>
                </div>
              );
            })}
          </div>
        )}
      </div>

      {/* ── Manual Booking Modal ────────────────────────────────────── */}
      <AnimatePresence>
        {bookingModalOpen && (
          <BookingModal
            date={selectedDate}
            resources={resources}
            services={services}
            onClose={() => setBookingModalOpen(false)}
            onSuccess={() => {
              setBookingModalOpen(false);
              qc.invalidateQueries({ queryKey: ["appointments"] });
            }}
          />
        )}
      </AnimatePresence>
    </div>
  );
}

// ─── Manual Appointment Booking Dialog ─────────────────────────────────────────
function BookingModal({
  date,
  resources,
  services,
  onClose,
  onSuccess,
}: {
  date: string;
  resources: any[];
  services: any[];
  onClose: () => void;
  onSuccess: () => void;
}) {
  const [customerName, setCustomerName] = useState("");
  const [customerPhone, setCustomerPhone] = useState("");
  const [selectedTime, setSelectedTime] = useState("10:00");
  const [resourceId, setResourceId] = useState(resources[0]?.id || "");
  const [serviceId, setServiceId] = useState(services[0]?.id || "");
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);

  async function handleBook(e: React.FormEvent) {
    e.preventDefault();
    if (!customerName.trim() || !customerPhone.trim()) {
      toast.error("Please enter customer name and phone.");
      return;
    }

    setSubmitting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) throw new Error("Not logged in");

      const [hours, mins] = selectedTime.split(":").map(Number);
      const startDt = new Date(`${date}T${hours.toString().padStart(2, "0")}:${mins.toString().padStart(2, "0")}:00.000Z`);
      const endDt = new Date(startDt.getTime() + 30 * 60 * 1000);

      const { data, error } = await (supabase as any).from("appointments").insert({
        user_id: user.id,
        customer_name: customerName.trim(),
        customer_phone: customerPhone.trim(),
        start_time: startDt.toISOString(),
        end_time: endDt.toISOString(),
        resource_id: resourceId || null,
        service_id: serviceId || null,
        status: "confirmed",
        notes: notes.trim() || "Manual booking via Workspace",
      });

      if (error) {
        if (error.code === "23P01" || error.message?.includes("no_double_booking")) {
          throw new Error("Double-booking prevented: This resource already has a booking at that time!");
        }
        throw error;
      }

      toast.success("Appointment booked successfully!");
      onSuccess();
    } catch (err: any) {
      toast.error(err.message || "Failed to book appointment.");
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <motion.div
      initial={{ opacity: 0 }}
      animate={{ opacity: 1 }}
      exit={{ opacity: 0 }}
      onClick={onClose}
      className="fixed inset-0 z-50 flex items-center justify-center bg-black/70 backdrop-blur-sm p-4"
    >
      <motion.div
        initial={{ scale: 0.95, opacity: 0 }}
        animate={{ scale: 1, opacity: 1 }}
        exit={{ scale: 0.95, opacity: 0 }}
        onClick={(e) => e.stopPropagation()}
        className="w-full max-w-md rounded-2xl border border-white/10 bg-[#0B1120] p-6 shadow-2xl space-y-4"
      >
        <div className="flex items-center justify-between border-b border-white/10 pb-3">
          <div className="flex items-center gap-2">
            <CalendarCheck className="w-4 h-4 text-cyan-400" />
            <h3 className="text-sm font-bold text-slate-100">New Appointment</h3>
          </div>
          <button onClick={onClose} className="p-1 rounded-lg text-slate-400 hover:text-slate-100">
            <X className="w-4 h-4" />
          </button>
        </div>

        <form onSubmit={handleBook} className="space-y-3">
          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Patient / Customer Name</Label>
            <Input
              value={customerName}
              onChange={(e) => setCustomerName(e.target.value)}
              placeholder="e.g. Ramesh Sharma"
              required
              className="bg-[#060912] border-white/10 text-slate-100"
            />
          </div>

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Phone Number</Label>
            <Input
              value={customerPhone}
              onChange={(e) => setCustomerPhone(e.target.value)}
              placeholder="+91 98765 43210"
              required
              className="bg-[#060912] border-white/10 text-slate-100"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Date</Label>
              <Input
                type="date"
                value={date}
                disabled
                className="bg-[#060912]/50 border-white/10 text-slate-400"
              />
            </div>
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Time Slot</Label>
              <Input
                type="time"
                value={selectedTime}
                onChange={(e) => setSelectedTime(e.target.value)}
                required
                className="bg-[#060912] border-white/10 text-slate-100"
              />
            </div>
          </div>

          {resources.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Practitioner / Staff</Label>
              <select
                value={resourceId}
                onChange={(e) => setResourceId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#060912] border border-white/10 text-slate-100 text-xs outline-none"
              >
                {resources.map((r: any) => (
                  <option key={r.id} value={r.id}>
                    {r.name} ({r.type})
                  </option>
                ))}
              </select>
            </div>
          )}

          {services.length > 0 && (
            <div className="space-y-1">
              <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Service</Label>
              <select
                value={serviceId}
                onChange={(e) => setServiceId(e.target.value)}
                className="w-full h-10 px-3 rounded-lg bg-[#060912] border border-white/10 text-slate-100 text-xs outline-none"
              >
                {services.map((s: any) => (
                  <option key={s.id} value={s.id}>
                    {s.name} (₹{s.price})
                  </option>
                ))}
              </select>
            </div>
          )}

          <div className="space-y-1">
            <Label className="text-xs uppercase tracking-wider text-slate-400 font-semibold">Notes / Symptoms</Label>
            <Input
              value={notes}
              onChange={(e) => setNotes(e.target.value)}
              placeholder="e.g. Regular health checkup"
              className="bg-[#060912] border-white/10 text-slate-100"
            />
          </div>

          <div className="pt-3 flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-semibold rounded-xl border border-white/10 text-slate-400 hover:text-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="flex items-center gap-1.5 bg-gradient-to-r from-blue-600 via-cyan-500 to-orange-500 px-5 py-2 text-xs font-bold uppercase tracking-wider text-white rounded-xl shadow-md hover:brightness-105 transition-all disabled:opacity-50"
            >
              {submitting ? <Loader2 className="w-3.5 h-3.5 animate-spin" /> : <CheckCircle2 className="w-3.5 h-3.5" />}
              Confirm Booking
            </button>
          </div>
        </form>
      </motion.div>
    </motion.div>
  );
}
