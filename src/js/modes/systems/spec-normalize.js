/** Systems spec normalization (Wave 17). */
import { slug, titleCase, fieldType, structuredCloneSafe, uid, pickRandom, threeWords } from './utils.js';
import { detectDomain, inferNameFromDesc } from './domain-config.js';
import { MAX_HISTORY, DOMAIN_SHELL_OPTIONS, VALID_SCREENS, FALLBACK_SCREENS } from './constants.js';

export function createSystemsSpecApi(ctx) {
  const { getRuntimeData } = ctx;
  const inferName = (desc) => inferNameFromDesc(desc);

  function defaultFields(entityName, domain = "") {
    const base = slug(entityName);

    // Domain-specific entity fields
    if (domain === "restaurant") {
      if (/order/.test(base)) return [
        { id:"table_number", label:"Table", type:"text", required:true },
        { id:"items", label:"Items Ordered", type:"textarea" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Seated","Order Placed","Preparing","Served","Bill Requested","Paid"] },
        { id:"waiter", label:"Waiter", type:"text" },
        { id:"time_placed", label:"Time Placed", type:"date" },
        { id:"guests", label:"Guests", type:"number" },
      ];
      if (/menu|item/.test(base)) return [
        { id:"item_name", label:"Item Name", type:"text", required:true },
        { id:"category", label:"Category", type:"select", options:["Starters","Mains","Sides","Desserts","Drinks","Specials"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"description", label:"Description", type:"textarea" },
        { id:"available", label:"Availability", type:"select", options:["Available","Out of Stock","Seasonal","Discontinued"] },
        { id:"prep_time", label:"Prep Time (min)", type:"number" },
      ];
      if (/table/.test(base)) return [
        { id:"table_number", label:"Table #", type:"text", required:true },
        { id:"capacity", label:"Capacity", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Occupied","Reserved","Cleaning","Closed"] },
        { id:"section", label:"Section", type:"select", options:["Indoor","Outdoor","Bar","Private","Terrace"] },
        { id:"current_guests", label:"Current Guests", type:"number" },
        { id:"waiter", label:"Assigned Waiter", type:"text" },
      ];
      if (/ingredient/.test(base)) return [
        { id:"name", label:"Ingredient", type:"text", required:true },
        { id:"category", label:"Category", type:"select", options:["Produce","Protein","Dairy","Dry Goods","Beverages","Spices"] },
        { id:"quantity", label:"Qty in Stock", type:"number" },
        { id:"unit", label:"Unit", type:"text" },
        { id:"reorder_level", label:"Reorder At", type:"number" },
        { id:"status", label:"Status", type:"select", options:["In Stock","Low Stock","Out of Stock","Ordered"] },
        { id:"last_ordered", label:"Last Ordered", type:"date" },
      ];
      if (/staff/.test(base)) return [
        { id:"name", label:"Name", type:"text", required:true },
        { id:"role", label:"Role", type:"select", options:["Head Chef","Sous Chef","Line Cook","Waiter","Bartender","Host","Manager","Dishwasher"] },
        { id:"shift", label:"Shift", type:"select", options:["Morning","Afternoon","Evening","Night","Weekend"] },
        { id:"hourly_rate", label:"Hourly Rate ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","On Leave","Part-Time","Training","Terminated"] },
        { id:"start_date", label:"Start Date", type:"date" },
      ];
    }

    if (domain === "hotel") {
      if (/booking|reservation/.test(base)) return [
        { id:"guest_name", label:"Guest Name", type:"text", required:true },
        { id:"room_number", label:"Room #", type:"text" },
        { id:"check_in", label:"Check-In", type:"date" },
        { id:"check_out", label:"Check-Out", type:"date" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Reserved","Confirmed","Checked In","Occupied","Checkout Pending","Checked Out","Cancelled"] },
        { id:"guests", label:"Guests", type:"number" },
      ];
      if (/room/.test(base)) return [
        { id:"room_number", label:"Room #", type:"text", required:true },
        { id:"type", label:"Type", type:"select", options:["Standard","Deluxe","Suite","Penthouse","Family Room","Studio"] },
        { id:"floor", label:"Floor", type:"number" },
        { id:"rate", label:"Nightly Rate ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Occupied","Reserved","Maintenance","Cleaning","Out of Order"] },
        { id:"view", label:"View", type:"select", options:["City","Ocean","Garden","Pool","Mountain"] },
      ];
      if (/guest/.test(base)) return [
        { id:"name", label:"Guest Name", type:"text", required:true },
        { id:"email", label:"Email", type:"text" },
        { id:"nationality", label:"Nationality", type:"text" },
        { id:"loyalty_tier", label:"Loyalty Tier", type:"select", options:["Bronze","Silver","Gold","Platinum","Diamond"] },
        { id:"visits", label:"Total Stays", type:"number" },
        { id:"last_stay", label:"Last Stay", type:"date" },
      ];
      if (/housekeeping/.test(base)) return [
        { id:"room_number", label:"Room #", type:"text", required:true },
        { id:"housekeeper", label:"Housekeeper", type:"text" },
        { id:"status", label:"Status", type:"select", options:["Dirty","Assigned","Cleaning","Inspected","Ready"] },
        { id:"priority", label:"Priority", type:"select", options:["Normal","Express","Do Not Disturb"] },
        { id:"scheduled", label:"Scheduled", type:"date" },
        { id:"notes", label:"Notes", type:"textarea" },
      ];
    }

    if (domain === "healthcare") {
      if (/patient/.test(base)) return [
        { id:"name", label:"Patient Name", type:"text", required:true },
        { id:"dob", label:"Date of Birth", type:"date" },
        { id:"gender", label:"Gender", type:"select", options:["Male","Female","Other","Prefer not to say"] },
        { id:"blood_type", label:"Blood Type", type:"select", options:["A+","A-","B+","B-","AB+","AB-","O+","O-"] },
        { id:"doctor", label:"Assigned Doctor", type:"text" },
        { id:"status", label:"Status", type:"select", options:["Registered","Waiting","With Doctor","Under Observation","Discharged"] },
        { id:"last_visit", label:"Last Visit", type:"date" },
      ];
      if (/appointment/.test(base)) return [
        { id:"patient_name", label:"Patient", type:"text", required:true },
        { id:"doctor", label:"Doctor", type:"text" },
        { id:"department", label:"Department", type:"select", options:["General","Cardiology","Orthopedics","Pediatrics","Neurology","Dermatology","Emergency"] },
        { id:"date", label:"Date", type:"date" },
        { id:"status", label:"Status", type:"select", options:["Scheduled","Confirmed","In Progress","Completed","Cancelled","No Show"] },
        { id:"type", label:"Type", type:"select", options:["Consultation","Follow-Up","Emergency","Check-Up","Procedure"] },
      ];
    }

    if (domain === "fitness") {
      if (/member/.test(base)) return [
        { id:"name", label:"Member Name", type:"text", required:true },
        { id:"email", label:"Email", type:"text" },
        { id:"membership_type", label:"Plan", type:"select", options:["Basic","Standard","Premium","VIP","Student","Corporate"] },
        { id:"status", label:"Status", type:"select", options:["Trial","Active","Expiring","Expired","Cancelled","Frozen"] },
        { id:"join_date", label:"Join Date", type:"date" },
        { id:"monthly_fee", label:"Monthly Fee ($)", type:"number" },
        { id:"trainer", label:"Personal Trainer", type:"text" },
      ];
      if (/class|schedule/.test(base)) return [
        { id:"class_name", label:"Class", type:"text", required:true },
        { id:"trainer", label:"Trainer", type:"text" },
        { id:"date", label:"Date", type:"date" },
        { id:"capacity", label:"Capacity", type:"number" },
        { id:"enrolled", label:"Enrolled", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Scheduled","Full","In Progress","Completed","Cancelled"] },
        { id:"type", label:"Type", type:"select", options:["Yoga","HIIT","Cycling","Pilates","Strength","CrossFit","Cardio","Swim"] },
      ];
    }

    if (domain === "realestate") {
      if (/propert/.test(base)) return [
        { id:"address", label:"Address", type:"text", required:true },
        { id:"type", label:"Type", type:"select", options:["Apartment","Villa","Office","Retail","Land","Warehouse","Townhouse"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"bedrooms", label:"Bedrooms", type:"number" },
        { id:"area_sqft", label:"Area (sqft)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Available","Under Offer","Sold","Off Market","Rented","Maintenance"] },
        { id:"agent", label:"Agent", type:"text" },
        { id:"listed_date", label:"Listed", type:"date" },
      ];
      if (/lead|deal/.test(base)) return [
        { id:"client_name", label:"Client", type:"text", required:true },
        { id:"property", label:"Property Interest", type:"text" },
        { id:"budget", label:"Budget ($)", type:"number" },
        { id:"status", label:"Stage", type:"select", options:["Lead","Qualified","Viewing Scheduled","Offer Made","Under Contract","Closed","Lost"] },
        { id:"agent", label:"Agent", type:"text" },
        { id:"date", label:"Date", type:"date" },
      ];
    }

    if (domain === "logistics") {
      if (/shipment/.test(base)) return [
        { id:"tracking_number", label:"Tracking #", type:"text", required:true },
        { id:"origin", label:"Origin", type:"text" },
        { id:"destination", label:"Destination", type:"text" },
        { id:"weight_kg", label:"Weight (kg)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Booked","Assigned","In Transit","At Depot","Out for Delivery","Delivered","Failed"] },
        { id:"driver", label:"Driver", type:"text" },
        { id:"expected_date", label:"Expected Delivery", type:"date" },
        { id:"value", label:"Cargo Value ($)", type:"number" },
      ];
    }

    if (domain === "retail") {
      if (/product/.test(base)) return [
        { id:"name", label:"Product Name", type:"text", required:true },
        { id:"sku", label:"SKU", type:"text" },
        { id:"category", label:"Category", type:"select", options:["Clothing","Electronics","Home","Beauty","Sports","Food","Toys","Books"] },
        { id:"price", label:"Price ($)", type:"number" },
        { id:"stock", label:"Stock", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","Low Stock","Out of Stock","Discontinued","Coming Soon"] },
        { id:"added_date", label:"Added", type:"date" },
      ];
      if (/order/.test(base)) return [
        { id:"order_number", label:"Order #", type:"text", required:true },
        { id:"customer", label:"Customer", type:"text" },
        { id:"total", label:"Total ($)", type:"number" },
        { id:"items_count", label:"Items", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Placed","Payment Confirmed","Picking","Packed","Shipped","Delivered","Returned"] },
        { id:"date", label:"Order Date", type:"date" },
        { id:"channel", label:"Channel", type:"select", options:["Online","In-Store","Mobile","Marketplace","Phone"] },
      ];
    }

    if (domain === "manufacturing") {
      if (/production|order/.test(base)) return [
        { id:"order_number", label:"Order #", type:"text", required:true },
        { id:"product", label:"Product", type:"text" },
        { id:"quantity", label:"Quantity", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Draft","Approved","Materials Sourced","In Production","QC","Completed","Shipped"] },
        { id:"machine", label:"Machine", type:"text" },
        { id:"start_date", label:"Start Date", type:"date" },
        { id:"due_date", label:"Due Date", type:"date" },
      ];
      if (/material/.test(base)) return [
        { id:"name", label:"Material", type:"text", required:true },
        { id:"supplier", label:"Supplier", type:"text" },
        { id:"quantity", label:"Qty in Stock", type:"number" },
        { id:"unit", label:"Unit", type:"text" },
        { id:"unit_cost", label:"Unit Cost ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["In Stock","Low Stock","Out of Stock","Ordered","On Hold"] },
        { id:"last_received", label:"Last Received", type:"date" },
      ];
    }

    if (domain === "hr") {
      if (/employee/.test(base)) return [
        { id:"name", label:"Name", type:"text", required:true },
        { id:"role", label:"Job Title", type:"text" },
        { id:"department", label:"Department", type:"select", options:["Engineering","Finance","Operations","Sales","Marketing","HR","Legal","Product"] },
        { id:"salary", label:"Salary ($)", type:"number" },
        { id:"status", label:"Status", type:"select", options:["Active","On Leave","Probation","Resigned","Terminated"] },
        { id:"start_date", label:"Start Date", type:"date" },
        { id:"manager", label:"Manager", type:"text" },
      ];
      if (/candidate/.test(base)) return [
        { id:"name", label:"Candidate Name", type:"text", required:true },
        { id:"role", label:"Applied Role", type:"text" },
        { id:"email", label:"Email", type:"text" },
        { id:"source", label:"Source", type:"select", options:["LinkedIn","Referral","Job Board","Agency","Direct","University"] },
        { id:"status", label:"Stage", type:"select", options:["Applied","Screened","Interview 1","Interview 2","Offer Sent","Hired","Rejected"] },
        { id:"applied_date", label:"Applied", type:"date" },
        { id:"salary_expectation", label:"Expected Salary ($)", type:"number" },
      ];
    }

    // Generic entity-name-based fallbacks
    if (/inventory|product|stock|item/.test(base)) return [
      { id:"name", label:"Item", type:"text", required:true },
      { id:"sku", label:"SKU", type:"text" },
      { id:"stock", label:"Stock", type:"number" },
      { id:"price", label:"Price", type:"number" },
      { id:"status", label:"Status", type:"select", options:["Active","Low Stock","Paused"] },
    ];
    if (/employee|hr|staff|payroll/.test(base)) return [
      { id:"name", label:"Name", type:"text", required:true },
      { id:"role", label:"Role", type:"text" },
      { id:"department", label:"Department", type:"select", options:["Operations","Sales","Finance","HR"] },
      { id:"salary", label:"Salary", type:"number" },
      { id:"status", label:"Status", type:"select", options:["Active","On Leave","Review"] },
    ];
    return [
      { id:"name", label:"Name", type:"text", required:true },
      { id:"owner", label:"Owner", type:"text" },
      { id:"amount", label:"Amount", type:"number" },
      { id:"status", label:"Status", type:"select", options:["New","In Progress","Approved","Closed"] },
      { id:"updated", label:"Updated", type:"date" },
    ];
  }

  function normalizeSpec(raw, desc = "", previousSpec = null) {
    const spec = raw && typeof raw === "object" ? structuredCloneSafe(raw) : {};
    spec.id = spec.id || previousSpec?.id || uid("system");
    spec.name = threeWords(spec.name || previousSpec?.name || inferName(desc) || "Business System");
    spec.description = String(spec.description || desc || previousSpec?.description || "Interactive business system prototype").slice(0, 180);
    spec.createdAt = spec.createdAt || previousSpec?.createdAt || Date.now();
    spec.updatedAt = Date.now();
    spec.revisionHistory = Array.isArray(spec.revisionHistory) ? spec.revisionHistory.slice(0, MAX_HISTORY) : [];

    spec.theme = {
      mode: spec.theme?.mode === "dark" ? "dark" : "light",
      primary: spec.theme?.primary || "#2563eb",
      accent: spec.theme?.accent || "#a70d2a",
      density: ["compact","comfortable","spacious"].includes(spec.theme?.density) ? spec.theme.density : "comfortable",
      radius: Number(spec.theme?.radius || 10),
    };
    const VALID_SHELLS = ["sidebar","top","dock","cards-nav","command"];
    spec.domain = spec.domain || detectDomain(desc);
    const defaultShell = (() => {
      const pool = DOMAIN_SHELL_OPTIONS[spec.domain] || DOMAIN_SHELL_OPTIONS.generic;
      return pickRandom(pool);
    })();
    spec.layout = {
      nav: spec.layout?.nav === "top" ? "top" : "sidebar",
      shell: VALID_SHELLS.includes(spec.layout?.shell) ? spec.layout.shell : defaultShell,
      dashboardStyle: spec.layout?.dashboardStyle || "operational",
    };

    const moduleNames = Array.isArray(spec.modules) && spec.modules.length
      ? spec.modules.map(m => m.name || m.id)
      : ["Overview", "Sales", "Inventory", "Customers", "Finance", "Operations"];
    spec.modules = moduleNames.slice(0, 10).map((name, idx) => {
      const old = Array.isArray(spec.modules) ? spec.modules[idx] || {} : {};
      const id = old.id || slug(name, `module_${idx + 1}`);
      const entity = old.entity || (idx === 0 ? slug(moduleNames[1] || "sales") : slug(name));
      const fallbackScreen = idx === 0 ? "dashboard" : FALLBACK_SCREENS[idx % FALLBACK_SCREENS.length];
      const screen = VALID_SCREENS.includes(old.screen) ? old.screen : fallbackScreen;
      return {
        id,
        name: String(old.name || name || `Module ${idx + 1}`).slice(0, 32),
        icon: old.icon || moduleIcon(name),
        entity,
        screen,
        kpis: Array.isArray(old.kpis) ? old.kpis : null,
        color: old.color || null,
      };
    });

    spec.entities = normalizeEntities(spec.entities, spec.modules);
    spec.mockData = normalizeData(spec.mockData, spec.entities, previousSpec);
    spec.screens = Array.isArray(spec.screens) ? spec.screens : [];
    spec.workflows = Array.isArray(spec.workflows) && spec.workflows.length ? spec.workflows : [
      { id:"approval_flow", name:"Approval Flow", stages:["Draft","Review","Approved","Closed"] },
      { id:"fulfillment", name:"Fulfillment", stages:["Requested","Assigned","In Progress","Done"] },
    ];
    spec.interactions = Array.isArray(spec.interactions) && spec.interactions.length ? spec.interactions : [
      "module navigation", "search", "sort", "row selection", "add record", "edit record", "delete record", "localStorage persistence"
    ];
    return spec;
  }

  function normalizeEntities(input, modules) {
    const map = {};
    if (input && typeof input === "object" && !Array.isArray(input)) {
      Object.entries(input).forEach(([id, e]) => {
        map[slug(id)] = {
          id: slug(e?.id || id),
          name: e?.name || titleCase(id),
          fields: Array.isArray(e?.fields) && e.fields.length ? e.fields.map(normalizeField) : defaultFields(e?.name || id),
        };
      });
    } else if (Array.isArray(input)) {
      input.forEach(e => {
        const id = slug(e?.id || e?.name);
        if (!id) return;
        map[id] = { id, name: e.name || titleCase(id), fields: Array.isArray(e.fields) && e.fields.length ? e.fields.map(normalizeField) : defaultFields(e.name || id) };
      });
    }
    modules.forEach(m => {
      const id = slug(m.entity || m.id);
      if (!map[id]) map[id] = { id, name: titleCase(id), fields: defaultFields(id) };
    });
    return map;
  }

  function normalizeField(f) {
    if (typeof f === "string") return { id: slug(f), label: titleCase(f), type: fieldType("", f) };
    const id = slug(f?.id || f?.name || f?.label, "field");
    return {
      id,
      label: f?.label || f?.name || titleCase(id),
      type: ["text","number","date","select","textarea"].includes(f?.type) ? f.type : fieldType("", id),
      options: Array.isArray(f?.options) && f.options.length ? f.options : undefined,
      required: !!f?.required,
    };
  }

  function normalizeData(input, entities, previousSpec) {
    const data = {};
    const oldRuntime = previousSpec ? getRuntimeData(previousSpec) : null;
    Object.values(entities).forEach(entity => {
      // Try to find AI-provided data using multiple key formats
      let rows = oldRuntime?.[entity.id] || null;
      if (!rows && input && typeof input === "object") {
        const candidates = [
          entity.id,
          entity.name,
          slug(entity.name),
          entity.name.toLowerCase(),
          entity.id.replace(/_/g, ""),
        ];
        for (const key of candidates) {
          if (Array.isArray(input[key]) && input[key].length) { rows = input[key]; break; }
        }
        // Last resort: case-insensitive search over all keys
        if (!rows) {
          const lc = entity.id.toLowerCase();
          const match = Object.keys(input).find(k => k.toLowerCase() === lc || slug(k) === lc);
          if (match && Array.isArray(input[match])) rows = input[match];
        }
      }
      data[entity.id] = Array.isArray(rows) && rows.length
        ? rows.map((r, idx) => normalizeRecord(r, entity, idx))
        : generateRows(entity, entity.id);
    });
    return data;
  }

  function normalizeRecord(row, entity, idx) {
    const out = { id: row?.id || `${entity.id}_${idx + 1}` };
    entity.fields.forEach(f => {
      // Try exact id, then label variants, then fuzzy slug match
      const val = row?.[f.id]
        ?? row?.[f.label]
        ?? row?.[f.label?.toLowerCase()]
        ?? row?.[slug(f.label)]
        ?? row?.[f.id.replace(/_/g,"")]
        ?? undefined;
      out[f.id] = val !== undefined ? val : sampleValue(f, idx, entity.id);
    });
    return out;
  }

  function generateRows(entity, seed = "") {
    return Array.from({ length: 8 }, (_, idx) => normalizeRecord({}, entity, idx));
  }

  // Seeded pseudo-random so each entity+field combo gets different but stable values
  function seededRand(seed, idx) {
    let h = 0;
    for (let i = 0; i < seed.length; i++) h = (Math.imul(31, h) + seed.charCodeAt(i)) | 0;
    h = (h + idx * 2654435761) | 0;
    return Math.min(0.999999, Math.abs(h) / 2147483647);
  }

  function sampleValue(field, idx, entitySeed = "") {
    const r = seededRand(entitySeed + field.id, idx);
    const ri = n => Math.floor(r * n);

    if (field.type === "number") {
      const base = seededRand(field.id, 0);
      if (/salary|wage|pay/i.test(field.id)) return Math.round(45000 + base * 155000 + idx * 8000);
      if (/hourly_rate|hourly/i.test(field.id)) return Math.round(14 + r * 46 + idx);
      if (/price|cost|amount|total|revenue|value/i.test(field.id)) {
        if (/menu|food|dish|meal|item_price/i.test(entitySeed)) return +(8 + r * 42).toFixed(2);
        return Math.round(50 + r * 4950 + idx * 200);
      }
      if (/fee|rate|nightly/i.test(field.id)) return Math.round(80 + r * 920 + idx * 50);
      if (/monthly_fee/i.test(field.id)) return Math.round(29 + r * 171 + idx * 10);
      if (/budget/i.test(field.id)) return Math.round(50000 + r * 950000);
      if (/qty|quantity|stock|count|units/i.test(field.id)) return Math.round(1 + r * 499 + idx * 12);
      if (/guests|capacity|enrolled|seats|people/i.test(field.id)) return Math.round(1 + r * 11 + (idx % 4));
      if (/floor|room_number/i.test(field.id)) return Math.floor(1 + r * 12) * 100 + Math.floor(r * 20) + 1;
      if (/prep_time|duration|minutes/i.test(field.id)) return [5,8,10,12,15,20,25,30][ri(8)];
      if (/visits|stays|orders_count/i.test(field.id)) return Math.round(1 + r * 49);
      if (/score|rate|percent|rating/i.test(field.id)) return Math.round(60 + r * 40);
      if (/age/i.test(field.id)) return Math.round(22 + r * 43);
      if (/weight|kg|lbs/i.test(field.id)) return +(5 + r * 295).toFixed(1);
      if (/area|sqft|sqm/i.test(field.id)) return Math.round(400 + r * 4600);
      if (/bedrooms/i.test(field.id)) return [1,2,2,3,3,4,5][ri(7)];
      return Math.round(100 + r * 9900 + idx * 300);
    }
    if (field.type === "date") {
      const months = ["2025-08","2025-09","2025-10","2025-11","2025-12","2026-01","2026-02","2026-03","2026-04","2026-05"];
      const m = months[ri(months.length)];
      const d = String(Math.floor(r * 27) + 1).padStart(2, "0");
      return `${m}-${d}`;
    }
    if (field.type === "select") {
      const opts = field.options?.length ? field.options : ["Active","Pending","Closed"];
      return opts[ri(opts.length)];
    }

    const firstNames = ["Sarah","James","Aisha","Carlos","Mei","Omar","Priya","Lucas","Fatima","David","Yuna","Ravi","Elena","Marcus","Layla","Tom","Zara","Kofi","Ana","Ethan"];
    const lastNames  = ["Chen","Osei","Patel","Müller","Santos","Kim","Reyes","Ali","Johnson","Okafor","Nakamura","Singh","Cohen","Williams","Dubois","García","Yamamoto","Mensah","Brown","Andersen"];
    const companies  = ["Meridian Co.","Stellar Inc.","Cascade Corp.","Ironvault Ltd.","Nexar Group","BluePeak","Solvex","Quorra","Crestfield","Lumina Tech","Arion Partners","Veltrix","Helix Solutions","Norwood & Co.","Solara","Drakenberg","Pinnacle","Trident","Epsilon","Zephyr"];
    const cities     = ["New York","London","Dubai","Singapore","Tokyo","Paris","Toronto","Sydney","Berlin","Mumbai","Seoul","São Paulo","Amsterdam","Chicago","Zurich"];
    const depts      = ["Engineering","Finance","Operations","Sales","Marketing","HR","Legal","Product","Customer Success","Procurement","IT","Logistics"];
    const statuses   = ["Active","In Progress","Pending","Approved","Closed","On Hold"];

    // Domain-specific text pools
    const menuItems  = ["Margherita Pizza","BBQ Chicken Burger","Caesar Salad","Grilled Salmon","Spaghetti Bolognese","Beef Tacos","Veggie Wrap","Tiramisu","Cheesecake Slice","Garlic Bread","Mushroom Risotto","Fish & Chips","Chicken Wings","Penne Arrabbiata","Brownie Sundae","Lamb Chops","Club Sandwich","Onion Rings","Lemon Tart","Truffle Fries"];
    const waiters    = ["Marco R.","Sophie L.","Tariq M.","Anna K.","Diego P.","Fatima H.","James O.","Lily C.","Rami A.","Claire D."];
    const roomTypes  = ["Standard King","Deluxe Twin","Ocean Suite","Family Suite","Studio Room","Executive King","Penthouse","Garden View"];
    const guestNames = ["Emily Watson","Hamid Al-Rashid","Yuki Tanaka","David Osei","Isabella Rossi","Arjun Sharma","Nour Mansour","Li Wei","Sara Johansson","Carlos Mendez","Priya Nair","Ahmed Hassan"];
    const addresses  = ["14 Maple Street","270 Riverside Ave","Apt 5B, 88 Oak Lane","Unit 3, 45 Park Blvd","12 Harbor View","Suite 200, 310 Commerce St","7 Hillside Close","22 Cedar Road"];
    const trackingNos = () => `TRK-${Date.now().toString(36).toUpperCase().slice(-4)}-${String(1000+ri(8999))}`;

    if (/table_number|table_no|table#/i.test(field.id)) return `T${String(idx + 1).padStart(2, "0")}`;
    if (/room_number|room#|room_no/i.test(field.id)) return `${Math.floor(1 + r * 5)}${String(Math.floor(r * 20) + 1).padStart(2,"0")}`;
    if (/tracking|track_no/i.test(field.id)) return `TRK-${entitySeed.slice(0,3).toUpperCase()}${String(1000 + idx * 37 + ri(500)).padStart(4,"0")}`;
    if (/order_number|order#|order_no/i.test(field.id)) return `ORD-${String(10000 + idx * 73 + ri(900)).padStart(5,"0")}`;
    if (/sku|code|ref|serial|barcode/i.test(field.id)) return `${entitySeed.slice(0,3).toUpperCase()}-${String(1000 + ri(8999)).padStart(4,"0")}`;
    if (/item_name|dish|meal|food_name/i.test(field.id)) return menuItems[ri(menuItems.length)];
    if (/waiter|server|attendant/i.test(field.id)) return waiters[ri(waiters.length)];
    if (/guest_name|guest/i.test(field.id) && !/count/.test(field.id)) return guestNames[ri(guestNames.length)];
    if (/room_type|room_kind/i.test(field.id)) return roomTypes[ri(roomTypes.length)];
    if (/address|street|property_address/i.test(field.id)) return addresses[ri(addresses.length)];
    if (/items_ordered|items|dishes/i.test(field.id)) return `${menuItems[ri(menuItems.length)]}, ${menuItems[ri(menuItems.length)]}`;
    if (/section|zone/i.test(field.id)) return ["Indoor","Outdoor","Bar","Private","Terrace"][ri(5)];
    if (/unit/i.test(field.id)) return ["kg","L","pcs","box","bag","dozen","oz","g"][ri(8)];
    if (/nationality|country/i.test(field.id)) return ["UAE","USA","UK","France","Germany","India","Australia","Canada","Japan","Italy"][ri(10)];
    if (/loyalty|tier|level/i.test(field.id)) return ["Bronze","Silver","Gold","Platinum"][ri(4)];
    if (/source/i.test(field.id)) return ["LinkedIn","Referral","Job Board","Agency","Direct","University"][ri(6)];
    if (/channel/i.test(field.id)) return ["Online","In-Store","Mobile","Marketplace"][ri(4)];
    if (/view/i.test(field.id)) return ["City","Ocean","Garden","Pool","Mountain"][ri(5)];
    if (/origin|from/i.test(field.id)) return cities[ri(cities.length)];
    if (/destination|to/i.test(field.id)) return cities[ri(cities.length)];
    if (/driver|carrier/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/supplier|vendor/i.test(field.id)) return companies[ri(companies.length)];
    if (/machine|equipment/i.test(field.id)) return ["CNC-A1","Press-04","Lathe-B2","Mixer-07","Welder-03","Cutter-12"][ri(6)];
    if (/product_name|product/i.test(field.id) && !/sku/.test(field.id)) return ["Hydraulic Valve","Steel Bracket","Circuit Board","Aluminum Sheet","Polymer Casing","LED Module","Drive Shaft","Sensor Array"][ri(8)];
    if (/material/i.test(field.id)) return ["Steel","Aluminum","Copper","Polymer","Resin","Carbon Fiber","Rubber","Glass"][ri(8)];
    if (/class_name|class/i.test(field.id)) return ["Advanced Yoga","HIIT Blast","Spin Class","Power Pilates","CrossFit WOD","Aqua Aerobics","Zumba Gold","Boxing Basics"][ri(8)];
    if (/trainer|coach/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/membership_type|plan/i.test(field.id)) return ["Basic","Standard","Premium","VIP","Student"][ri(5)];
    if (/housekeeper/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/^(name|full_name|employee_name|customer_name|client_name|contact_name|patient_name|candidate_name|person)$/i.test(field.id)) {
      return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    }
    if (/company|organization|client|customer|vendor/i.test(field.id)) return companies[ri(companies.length)];
    if (/email/i.test(field.id)) { const fn = firstNames[ri(firstNames.length)].toLowerCase(); return `${fn}@${companies[ri(companies.length)].split(" ")[0].toLowerCase()}.com`; }
    if (/phone|tel/i.test(field.id)) return `+1 (${300+ri(699)}) ${100+ri(899)}-${1000+ri(8999)}`;
    if (/city|location|region/i.test(field.id)) return cities[ri(cities.length)];
    if (/department|dept|division/i.test(field.id)) return depts[ri(depts.length)];
    if (/role|title|position|job/i.test(field.id)) return ["Senior Manager","Analyst","Specialist","Director","Lead","Coordinator","Consultant","Engineer"][ri(8)];
    if (/owner|assigned|manager|lead/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/note|comment|description|detail|remark/i.test(field.id)) return ["Awaiting review","High priority","Follow-up needed","Documentation complete","Approved by management","Escalated to team lead","On track","Needs clarification"][ri(8)];
    if (/name/i.test(field.id)) return `${firstNames[ri(firstNames.length)]} ${lastNames[ri(lastNames.length)]}`;
    if (/status|stage|state/i.test(field.id)) return statuses[ri(statuses.length)];
    return `${titleCase(field.label)} ${idx + 1}`;
  }

  function moduleIcon(name) {
    const n = String(name || "").toLowerCase();
    if (/dashboard|overview|home|summary/.test(n)) return "dashboard";
    if (/sale|revenue|crm/.test(n)) return "chart";
    if (/customer|client|contact/.test(n)) return "customers";
    if (/inventory|product|stock|warehouse/.test(n)) return "box";
    if (/order|purchase|requisition/.test(n)) return "orders";
    if (/menu|food|recipe|dish|cuisine/.test(n)) return "menu";
    if (/finance|account|invoice|billing|payment/.test(n)) return "coin";
    if (/hr|employee|staff|payroll/.test(n)) return "people";
    if (/report|analytic|insight|metric/.test(n)) return "reports";
    if (/project|task|operation|workflow/.test(n)) return "flow";
    if (/supplier|vendor|procurement/.test(n)) return "supplier";
    if (/setting|config|admin/.test(n)) return "settings";
    if (/document|contract|file/.test(n)) return "docs";
    if (/schedule|calendar|appointment/.test(n)) return "calendar";
    if (/ship|deliver|logistics|dispatch/.test(n)) return "truck";
    if (/support|ticket|help/.test(n)) return "support";
    if (/market|campaign|email/.test(n)) return "marketing";
    return "grid";
  }

  function iconSvg(type) {
    const set = {
      dashboard: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="2" rx=".5"/><rect x="2" y="12" width="5" height="2" rx=".5"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
      chart: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.6"><path d="M2 13V3M2 13h12"/><path d="M5 10V7M8 10V4M11 10V6"/></svg>`,
      customers: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2"/><path d="M2 13a4 4 0 0 1 8 0"/><path d="M11 7a2 2 0 1 0 0-4"/><path d="M14 13a3 3 0 0 0-3-3"/></svg>`,
      box: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2 13 4.7v6.6L8 14l-5-2.7V4.7z"/><path d="m3 4.7 5 2.7 5-2.7M8 7.4V14"/></svg>`,
      orders: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="10" rx="1.5"/><path d="M5 7h6M5 10h4"/><circle cx="11" cy="10" r="1" fill="currentColor" stroke="none"/></svg>`,
      menu: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M8 2a3 3 0 0 0-3 3c0 1.5.8 2.6 2 3.2V13h2v-4.8c1.2-.6 2-1.7 2-3.2a3 3 0 0 0-3-3z"/><path d="M5 12h6"/></svg>`,
      coin: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="5.5"/><path d="M8 5.5v5M6.5 7h2.3a1.2 1.2 0 0 1 0 2.4H7"/></svg>`,
      people: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="6" cy="5" r="2"/><path d="M2.5 13a3.5 3.5 0 0 1 7 0"/><path d="M10 7a2 2 0 0 0 0-4M10.5 10.5A3 3 0 0 1 13.5 13"/></svg>`,
      reports: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="3" y="2" width="10" height="12" rx="1.5"/><path d="M5 6h6M5 9h6M5 12h3"/></svg>`,
      flow: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="4" height="4" rx="1"/><rect x="10" y="2" width="4" height="4" rx="1"/><rect x="6" y="10" width="4" height="4" rx="1"/><path d="M6 4h4M8 6v4"/></svg>`,
      supplier: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="5" width="8" height="8" rx="1"/><path d="M10 7h2.5L14 9.5V13h-4"/><circle cx="5" cy="13.5" r="1.2"/><circle cx="11" cy="13.5" r="1.2"/></svg>`,
      settings: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="2"/><path d="M8 2v1M8 13v1M2 8h1M13 8h1M3.8 3.8l.7.7M11.5 11.5l.7.7M3.8 12.2l.7-.7M11.5 4.5l.7-.7"/></svg>`,
      docs: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M4 2h6l3 3v9a1 1 0 0 1-1 1H4a1 1 0 0 1-1-1V3a1 1 0 0 1 1-1z"/><path d="M10 2v3h3M5 8h6M5 11h4"/></svg>`,
      calendar: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="3" width="12" height="11" rx="1.5"/><path d="M5 2v2M11 2v2M2 7h12"/><circle cx="5.5" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="8" cy="10" r=".8" fill="currentColor" stroke="none"/><circle cx="10.5" cy="10" r=".8" fill="currentColor" stroke="none"/></svg>`,
      truck: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="1" y="5" width="9" height="7" rx="1"/><path d="M10 7h2.5L14 9v3h-4"/><circle cx="4" cy="12.5" r="1.2"/><circle cx="11.5" cy="12.5" r="1.2"/></svg>`,
      support: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><circle cx="8" cy="8" r="6"/><path d="M6 6a2 2 0 1 1 2.7 1.9C8.3 8.2 8 8.6 8 9"/><circle cx="8" cy="11.5" r=".6" fill="currentColor" stroke="none"/></svg>`,
      marketing: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><path d="M3 9V7l8-4v10L3 9z"/><path d="M3 7v5a2 2 0 0 0 2 2"/><circle cx="13" cy="8" r="1.5"/></svg>`,
      grid: `<svg viewBox="0 0 16 16" fill="none" stroke="currentColor" stroke-width="1.5"><rect x="2" y="2" width="5" height="5" rx="1"/><rect x="9" y="2" width="5" height="5" rx="1"/><rect x="2" y="9" width="5" height="5" rx="1"/><rect x="9" y="9" width="5" height="5" rx="1"/></svg>`,
    };
    return set[type] || set.grid;
  }

  return {
    defaultFields, normalizeSpec, normalizeEntities, normalizeField, normalizeData,
    normalizeRecord, generateRows, seededRand, sampleValue,
  };
}
