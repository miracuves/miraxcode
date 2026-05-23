/** Domain detection + template configs (Wave 16). */
import { DOMAIN_SHELL_OPTIONS } from './constants.js';
import { threeWords } from './utils.js';

export function detectDomain(desc) {
    const d = String(desc || "").toLowerCase();
    if (/pizza|burger|restaurant|cafe|dine|bistro|grill|kitchen|food|eatery|brasserie|canteen/.test(d)) return "restaurant";
    if (/hotel|resort|hostel|motel|lodge|hospitality|booking|accommodation/.test(d)) return "hotel";
    if (/clinic|medical|hospital|healthcare|doctor|patient|pharmacy|health/.test(d)) return "healthcare";
    if (/school|student|university|college|course|class|education|academy/.test(d)) return "education";
    if (/gym|fitness|wellness|spa|yoga|sport|training|club/.test(d)) return "fitness";
    if (/real estate|property|rent|lease|agent|realty|housing|mortgage/.test(d)) return "realestate";
    if (/retail|shop|ecommerce|e-commerce|store|boutique|fashion|clothing/.test(d)) return "retail";
    if (/logistics|delivery|transport|shipping|courier|fleet|truck|supply chain/.test(d)) return "logistics";
    if (/manufactur|factory|production|assembly|plant|machining/.test(d)) return "manufacturing";
    if (/hr|human resource|payroll|employee|staff management|talent|recruit/.test(d)) return "hr";
    if (/law|legal|firm|contract|case|attorney|counsel/.test(d)) return "legal";
    if (/jewel|gold|gem|diamond|luxury/.test(d)) return "jewelry";
    if (/saas|software|tech|startup|product|app/.test(d)) return "saas";
    return "generic";
  }


export const DOMAIN_CONFIG = {
    restaurant: {
      name: "Restaurant Management",
      theme: { mode:"light", primary:"#92400e", accent:"#f59e0b" },
      modules: [
        { name:"Live Orders", screen:"kanban", entity:"orders" },
        { name:"Menu",        screen:"list",   entity:"menu_items" },
        { name:"Tables",      screen:"split",  entity:"tables" },
        { name:"Staff",       screen:"split",  entity:"staff" },
        { name:"Inventory",   screen:"list",   entity:"ingredients" },
        { name:"Reports",     screen:"report", entity:"orders" },
      ],
      kpis: {
        orders:  [{label:"Today's Orders",aggregate:"count"},{label:"Total Revenue",field:"total",aggregate:"sum"},{label:"Open Orders",field:"status",aggregate:"count"},{label:"Avg Order",field:"total",aggregate:"avg"}],
        menu_items: [{label:"Menu Items",aggregate:"count"},{label:"Avg Price",field:"price",aggregate:"avg"},{label:"Available",aggregate:"count"}],
      },
      workflows: [
        {id:"dine_flow",name:"Dine-In Flow",stages:["Seated","Order Placed","Preparing","Served","Bill Requested","Paid"]},
        {id:"kitchen",name:"Kitchen Dispatch",stages:["Received","Cooking","Ready","Delivered"]},
      ],
    },
    hotel: {
      name: "Hotel Operations",
      theme: { mode:"light", primary:"#1e3a5f", accent:"#60a5fa" },
      modules: [
        { name:"Reservations", screen:"kanban", entity:"bookings" },
        { name:"Rooms",        screen:"split",  entity:"rooms" },
        { name:"Guests",       screen:"split",  entity:"guests" },
        { name:"Housekeeping", screen:"kanban", entity:"housekeeping" },
        { name:"Services",     screen:"list",   entity:"services" },
        { name:"Revenue",      screen:"report", entity:"bookings" },
      ],
      workflows: [
        {id:"checkin",name:"Check-In Flow",stages:["Reserved","Confirmed","Checked In","Occupied","Checkout Pending","Checked Out"]},
        {id:"housekeeping",name:"Housekeeping",stages:["Dirty","Assigned","Cleaning","Inspected","Ready"]},
      ],
    },
    healthcare: {
      name: "Clinic Management",
      theme: { mode:"light", primary:"#0e7490", accent:"#06b6d4" },
      modules: [
        { name:"Appointments", screen:"kanban", entity:"appointments" },
        { name:"Patients",     screen:"split",  entity:"patients" },
        { name:"Records",      screen:"list",   entity:"medical_records" },
        { name:"Billing",      screen:"list",   entity:"invoices" },
        { name:"Staff",        screen:"split",  entity:"staff" },
        { name:"Analytics",    screen:"report", entity:"appointments" },
      ],
      workflows: [
        {id:"patient_flow",name:"Patient Flow",stages:["Registered","Waiting","With Doctor","Under Observation","Discharged"]},
        {id:"billing",name:"Billing Cycle",stages:["Draft","Sent","Partial","Paid","Overdue"]},
      ],
    },
    education: {
      name: "School Management System",
      theme: { mode:"light", primary:"#3730a3", accent:"#818cf8" },
      modules: [
        { name:"Students",    screen:"split",  entity:"students" },
        { name:"Classes",     screen:"list",   entity:"classes" },
        { name:"Attendance",  screen:"report", entity:"attendance" },
        { name:"Grades",      screen:"list",   entity:"grades" },
        { name:"Teachers",    screen:"split",  entity:"teachers" },
        { name:"Finance",     screen:"report", entity:"fees" },
      ],
      workflows: [
        {id:"enrollment",name:"Enrollment",stages:["Applied","Documents Submitted","Reviewed","Enrolled","Active"]},
        {id:"grading",name:"Grading Cycle",stages:["Assessment Created","In Progress","Submitted","Graded","Published"]},
      ],
    },
    fitness: {
      name: "Fitness Center Management",
      theme: { mode:"dark", primary:"#7c3aed", accent:"#a70d2a" },
      modules: [
        { name:"Members",   screen:"split",  entity:"members" },
        { name:"Classes",   screen:"kanban", entity:"classes" },
        { name:"Schedule",  screen:"list",   entity:"schedule" },
        { name:"Trainers",  screen:"split",  entity:"trainers" },
        { name:"Revenue",   screen:"report", entity:"memberships" },
        { name:"Equipment", screen:"list",   entity:"equipment" },
      ],
      workflows: [
        {id:"membership",name:"Membership",stages:["Trial","Pending Payment","Active","Expiring","Renewed","Cancelled"]},
      ],
    },
    realestate: {
      name: "Real Estate Management",
      theme: { mode:"light", primary:"#047857", accent:"#a70d2a" },
      modules: [
        { name:"Properties", screen:"split",  entity:"properties" },
        { name:"Leads",      screen:"kanban", entity:"leads" },
        { name:"Deals",      screen:"kanban", entity:"deals" },
        { name:"Clients",    screen:"split",  entity:"clients" },
        { name:"Viewings",   screen:"list",   entity:"viewings" },
        { name:"Analytics",  screen:"report", entity:"deals" },
      ],
      workflows: [
        {id:"deal_flow",name:"Deal Pipeline",stages:["Lead","Qualified","Viewing Scheduled","Offer Made","Under Contract","Closed"]},
      ],
    },
    retail: {
      name: "Retail Management",
      theme: { mode:"light", primary:"#db2777", accent:"#f472b6" },
      modules: [
        { name:"Products",  screen:"list",   entity:"products" },
        { name:"Orders",    screen:"kanban", entity:"orders" },
        { name:"Customers", screen:"split",  entity:"customers" },
        { name:"Inventory", screen:"list",   entity:"inventory" },
        { name:"Promotions",screen:"list",   entity:"promotions" },
        { name:"Analytics", screen:"report", entity:"orders" },
      ],
      workflows: [
        {id:"order_flow",name:"Order Fulfillment",stages:["Placed","Payment Confirmed","Picking","Packed","Shipped","Delivered"]},
      ],
    },
    logistics: {
      name: "Logistics & Fleet Management",
      theme: { mode:"dark", primary:"#0369a1", accent:"#38bdf8" },
      modules: [
        { name:"Shipments", screen:"kanban", entity:"shipments" },
        { name:"Routes",    screen:"list",   entity:"routes" },
        { name:"Drivers",   screen:"split",  entity:"drivers" },
        { name:"Fleet",     screen:"list",   entity:"vehicles" },
        { name:"Clients",   screen:"split",  entity:"clients" },
        { name:"Reports",   screen:"report", entity:"shipments" },
      ],
      workflows: [
        {id:"shipment",name:"Shipment Lifecycle",stages:["Booked","Assigned","In Transit","At Depot","Out for Delivery","Delivered"]},
      ],
    },
    manufacturing: {
      name: "Manufacturing Operations",
      theme: { mode:"dark", primary:"#1d4ed8", accent:"#fb923c" },
      modules: [
        { name:"Production Orders", screen:"kanban", entity:"production_orders" },
        { name:"Products",          screen:"list",   entity:"products" },
        { name:"Materials",         screen:"list",   entity:"materials" },
        { name:"Machines",          screen:"split",  entity:"machines" },
        { name:"Quality Control",   screen:"list",   entity:"qc_checks" },
        { name:"Reports",           screen:"report", entity:"production_orders" },
      ],
      workflows: [
        {id:"prod",name:"Production Flow",stages:["Draft","Approved","Materials Sourced","In Production","QC","Completed","Shipped"]},
      ],
    },
    hr: {
      name: "HR Management System",
      theme: { mode:"light", primary:"#6d28d9", accent:"#c4b5fd" },
      modules: [
        { name:"Employees",    screen:"split",  entity:"employees" },
        { name:"Recruitment",  screen:"kanban", entity:"candidates" },
        { name:"Leave",        screen:"kanban", entity:"leave_requests" },
        { name:"Payroll",      screen:"list",   entity:"payroll" },
        { name:"Performance",  screen:"report", entity:"reviews" },
        { name:"Departments",  screen:"list",   entity:"departments" },
      ],
      workflows: [
        {id:"hire",name:"Hiring Pipeline",stages:["Applied","Screened","Interview 1","Interview 2","Offer Sent","Hired","Rejected"]},
        {id:"leave",name:"Leave Approval",stages:["Submitted","Manager Review","HR Review","Approved","Rejected"]},
      ],
    },
    legal: {
      name: "Legal Case Management",
      theme: { mode:"light", primary:"#1c1917", accent:"#d97706" },
      modules: [
        { name:"Cases",      screen:"kanban", entity:"cases" },
        { name:"Clients",    screen:"split",  entity:"clients" },
        { name:"Documents",  screen:"list",   entity:"documents" },
        { name:"Hearings",   screen:"calendar", entity:"hearings" },
        { name:"Billing",    screen:"list",   entity:"invoices" },
        { name:"Analytics",  screen:"report", entity:"cases" },
      ],
      workflows: [
        {id:"case_flow",name:"Case Lifecycle",stages:["Intake","Discovery","Filing","Hearing","Judgement","Closed"]},
        {id:"billing",name:"Billing",stages:["Draft","Sent","Partial","Paid","Overdue"]},
      ],
    },
    jewelry: {
      name: "Jewelry Management",
      theme: { mode:"dark", primary:"#b45309", accent:"#fbbf24" },
      modules: [
        { name:"Inventory",  screen:"cards",  entity:"jewelry" },
        { name:"Orders",     screen:"kanban", entity:"orders" },
        { name:"Customers",  screen:"split",  entity:"customers" },
        { name:"Suppliers",  screen:"list",   entity:"suppliers" },
        { name:"Appraisals", screen:"list",   entity:"appraisals" },
        { name:"Revenue",    screen:"report", entity:"orders" },
      ],
      workflows: [
        {id:"order",name:"Order Flow",stages:["Inquiry","Quote Sent","Deposit","In Production","Ready","Delivered","Paid"]},
      ],
    },
    generic: {
      name: "Business Operating System",
      theme: { mode:"light", primary:"#2563eb", accent:"#a70d2a" },
      modules: [
        { name:"Dashboard",  screen:"dashboard", entity:"records" },
        { name:"Records",    screen:"list",      entity:"records" },
        { name:"Pipeline",   screen:"kanban",    entity:"pipeline" },
        { name:"Contacts",   screen:"split",     entity:"contacts" },
        { name:"Finance",    screen:"report",    entity:"finance" },
        { name:"Reports",    screen:"report",    entity:"records" },
      ],
      workflows: [
        {id:"approval",name:"Approval Flow",stages:["Draft","Review","Approved","Closed"]},
      ],
    },
  };


export function inferNameFromDesc(desc) {
  const m = String(desc || "").match(/(?:called|named)\s+["'"«]?([^"'"»,\.]+)/i);
  if (m) return threeWords(m[1].trim());
  const domain = detectDomain(desc);
  return DOMAIN_CONFIG[domain]?.name || "Business Operating System";
}
