-- Une fausse API omsi pour essayer streamdeck.lua sans le jeu. Les fonctions __* sont
-- fournies par test/e2e.ts (UDP et fichiers réels).

local timers, handlers, calls = {}, {}, {}
local now = 0
local function log(s) calls[#calls + 1] = s end

local bus = {
  speed = 31.6, gear = 2, engine = true, rpm = 1200, electrics = true, doors_open = false,
  indicator = "off", headlights = 2, handbrake = false, horn = false, stop_request = true,
  fuel = 180.4, passengers = 12,
}
local interior = 0
local view = "driver"

-- Deux bus : le Citaro C2 de GPM et un Heuliez GX327 (les noms de leurs vrais scripts).
local BUSES = {
  c2 = {
    triggers = { "bus_doorfront0", "bus_doorfront0_off", "bus_doorfront1", "bus_doorfront1_off",
                 "bus_dooraft", "C2_CP_BT_Tuer_3", "C2_CP_BT_Tuer_3_off", "C2_CP_Tuerfreigabe_0",
                 "C2_CP_Tuerfreigabe_1", "C2_CP_BT_Kneeling", "C2_CP_BT_Kneeling_off", "horn",
                 "cp_door_01_nothahn", "automatic_D", "automatic_N", "automatic_R" },
    leaves = 0,
    gear_var = "C2_Getriebe_Gangvorwahl", gear_values = { R = 0, N = 1, D = 2 },
    vars = { C2_CP_BT_Tuerfreigabe = 0, C2_CP_AZ_Tuer_1 = 0, C2_Getriebe_Gangvorwahl = 1,
             C2_Tuer_1_V_pos = 0, C2_Tuer_1_H_pos = 0, C2_Tuer_1_V_Gummi_pos = 0,
             C2_Tuer_2_V_pos = 0, C2_Tuer_2_H_pos = 0, C2_Tuer_3_V_pos = 0, C2_Tuer_3_H_pos = 0 },
    dev_var = "C2_CP_BT_Tuerfreigabe",
    dev_trigger = "bus_dooraft",
  },
  -- Heuliez GX427 (Script/PORTES/Doors_3DVV.osc) : CG_active = DEV, bus_dooraft = frein d'arrêt
  gx427 = {
    triggers = { "bus_doorfront0", "bus_doorfront0_off", "bus_doorfront1", "bus_doorfront2",
                 "CG_active", "CG_active_off", "bus_dooraft", "bus_doorfront_all_close",
                 "bus_SECU_off", "door0_drag", "automatic_D", "automatic_N", "automatic_R" },
    gear_var = "antrieb_getr_gangvorwahl", gear_values = { R = 0, N = 1, D = 4 },
    leaves = 6,
    vars = { DEV = 0, bremse_halte = 0, antrieb_getr_gangvorwahl = 1 },
    dev_var = "DEV",
    dev_trigger = "CG_active",
    brake_trigger = "bus_dooraft",
  },
}
local current = BUSES.c2
local leaves = {}
-- openOMSI rend les noms de triggers et de variables en minuscules : le faux jeu aussi.
for _, bus in pairs(BUSES) do
  for k, t in ipairs(bus.triggers) do bus.triggers[k] = t:lower() end
  local vars = {}
  for k, v in pairs(bus.vars) do vars[k:lower()] = v end
  bus.vars = vars
  bus.dev_var = bus.dev_var:lower()
  bus.dev_trigger = bus.dev_trigger:lower()
  bus.brake_trigger = bus.brake_trigger and bus.brake_trigger:lower()
  bus.gear_var = bus.gear_var:lower()
end

local function set_bus(name)
  current = BUSES[name]
  leaves = {}
  for k = 1, current.leaves do leaves[k] = 0 end
end
set_bus("c2")
function __set_bus(name) set_bus(name) end
function __set_var(name, value) current.vars[name:lower()] = tonumber(value) end

local function encode(v)
  local t = type(v)
  if t == "nil" then return "null" end
  if t == "boolean" or t == "number" then return tostring(v) end
  if t == "string" then return '"' .. v:gsub('[\\"]', "\\%0") .. '"' end
  if #v > 0 then
    local out = {}
    for _, x in ipairs(v) do out[#out + 1] = encode(x) end
    return "[" .. table.concat(out, ",") .. "]"
  end
  local out = {}
  for k, x in pairs(v) do out[#out + 1] = encode(tostring(k)) .. ":" .. encode(x) end
  return "{" .. table.concat(out, ",") .. "}"
end

omsi = {
  json = { encode = encode },
  send = function(port, text) __send(port, text) return true end,
  every = function(s, fn) timers[#timers + 1] = { every = s, due = now + s, fn = fn } end,
  on = function(ev, fn) handlers[ev] = handlers[ev] or {}; table.insert(handlers[ev], fn) end,
  info = function()
    return { paused = false, view = view, clock = 8 * 3600 + 14 * 60, vehicle_model = "SD202",
             line = "136", tour = "3", delay = 95, next_stop = "Rathaus Spandau", at_stop = false }
  end,
  files = {
    dir = function() return __dir() end,
    mkdir = function(p) return __mkdir(p) end,
    list = function(p)
      local out = {}
      for name in (__list(p) or ""):gmatch("[^\n]+") do out[#out + 1] = { name = name, dir = false, size = 1 } end
      return out
    end,
    read = function(p) return __read(p) end,
    write = function(p, data) return __write(p, data) end,
    delete = function(p) return __delete(p) end,
  },
  bus = {
    state = function()
      local s = {}
      for k, v in pairs(bus) do s[k] = v end
      local open = 0
      for _, l in ipairs(leaves) do open = open + l end
      for name, v in pairs(current.vars) do
        if name:match("^c2_tuer_%d_[vh]_pos$") then open = open + v end
      end
      s.doors_open = open > 0
      return s
    end,
    doors = function() return leaves end,
    door_count = function() return 2 end,
    triggers = function() return current.triggers end,
    get_vars = function() return current.vars end,
    toggle_door = function(n)
      log("toggle_door " .. n)
      for k = 1, #leaves do leaves[k] = 1 - leaves[k] end
      for name, v in pairs(current.vars) do
        if name:match("^c2_tuer_%d_[vh]_pos$") then current.vars[name] = 1 - v end
      end
      return true
    end,
    indicator = function() return bus.indicator end,
    set_indicator = function(s) log("set_indicator " .. s); bus.indicator = s; return true end,
    toggle_handbrake = function() log("toggle_handbrake"); bus.handbrake = not bus.handbrake; return true end,
    start_up = function() log("start_up"); bus.engine = not bus.engine; return "ok" end,
    sound_horn = function(d) log("sound_horn " .. tostring(d)); bus.horn = d; return true end,
    interior_light = function() return interior end,
    set_interior_light = function(on) log("set_interior_light " .. tostring(on)); interior = on and 1 or 0; return true end,
    action = function(name, down)
      log("action " .. name .. " " .. tostring(down))
      return name ~= "unknown_action"
    end,
    kneeling = function() return false end,
    stop_brake = function()
      if current.vars.bremse_halte == nil then return nil end
      return current.vars.bremse_halte ~= 0
    end,
  },
  map = { speed_limit = function() return 50 end },
  game = { action = function(name) log("game " .. name); return true end },
  camera = { set_view = function(v) log("view " .. v); view = v; return true end },
  press = function(n) log("press " .. n) end,
  release = function(n) log("release " .. n) end,
  trigger = function(name)
    log("trigger " .. name)
    local n = name:lower()
    local known = false
    for _, t in ipairs(current.triggers) do if t == n then known = true end end
    if not known then return end
    -- les portes du faux bus : bus_doorfront<k> et *_Tuer_<n> ouvrent les vantaux de la porte
    local door = n:match("^bus_doorfront(%d)$")
    door = door and tonumber(door) + 1 or tonumber(n:match("tuer_(%d)$") or "")
    if door then
      if current.leaves > 0 then
        for k = 2 * door - 1, 2 * door do leaves[k] = 1 - leaves[k] end
      else
        for _, side in ipairs({ "V", "H" }) do
          local v = "c2_tuer_" .. door .. "_" .. side:lower() .. "_pos"
          current.vars[v] = 1 - current.vars[v]
        end
      end
    end
    if n == current.dev_trigger then
      current.vars[current.dev_var] = current.vars[current.dev_var] == 0 and 1 or 0
    end
    local pos = n:match("^automatic_([dnr])$")
    if pos then current.vars[current.gear_var] = current.gear_values[pos:upper()] end
    if n == current.brake_trigger then
      current.vars.bremse_halte = current.vars.bremse_halte == 0 and 1 or 0
    end
  end,
  var = function(name) return current.vars[name:lower()] end,
}

function __tick(dt)
  now = now + dt
  for _, t in ipairs(timers) do
    if now >= t.due then t.due = now + t.every; t.fn() end
  end
end

function __fire(ev, ...)
  for _, fn in ipairs(handlers[ev] or {}) do fn(...) end
end

function __calls()
  local s = table.concat(calls, "\n")
  calls = {}
  return s
end
