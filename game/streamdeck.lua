-- plugins/streamdeck.lua : pont entre openOMSI et le plugin Stream Deck "openOMSI".
--
-- Jeu -> Stream Deck : l'état du bus en JSON, en UDP sur 127.0.0.1:47820 (5 fois par
-- seconde, et tout de suite quand une porte, un clignotant, un phare... change).
-- Stream Deck -> jeu : le plugin Stream Deck dépose des fichiers "<id>.cmd" dans
-- plugins/streamdeck.data/inbox/ ; ils sont lus, exécutés puis effacés ici. Chaque
-- commande reçoit une réponse { ack = id, ok = true/false } par le même canal UDP.
--
-- Une commande est une ligne de mots : "<id> <commande> [arguments...]".
--
-- Dans le dossier de données aussi :
-- - triggers.txt (écrit ici) : les triggers du bus, un par ligne, pour les listes du
--   Stream Deck ;
-- - watch.txt (écrit par le Stream Deck) : les variables de script dont les touches
--   montrent l'état, une par ligne ; leurs valeurs partent dans "vars".

local PORT = 47820
local INBOX = "inbox"
local VERSION = 2

omsi.files.mkdir(INBOX)
local data_dir = omsi.files.dir()

local function bool(v)
  if v == nil then return nil end
  return v and true or false
end

-- Les triggers du bus ------------------------------------------------------------------

-- openOMSI rend les noms de triggers et de variables en minuscules (OMSI ne fait pas la
-- différence) : tout est comparé en minuscules ici.
local triggers = nil -- nom en minuscules -> true, pour le bus actuel
local door_cache = {} -- n -> nom du trigger (ou false)
local leaf_vars = {} -- n -> les variables de position des vantaux de la porte n

-- Les vantaux par porte quand le bus les nomme ainsi (le C2 : C2_Tuer_1_V_pos et
-- C2_Tuer_1_H_pos), pour les bus sans les variables door_0, door_1... habituelles.
local function load_leaf_vars()
  leaf_vars = {}
  for name in pairs(omsi.bus.get_vars() or {}) do
    local n = name:lower():match("tuer_?(%d)_[vh]_pos$")
    if n then
      n = tonumber(n)
      leaf_vars[n] = leaf_vars[n] or {}
      table.insert(leaf_vars[n], name)
    end
  end
end

local function load_triggers()
  load_leaf_vars()
  triggers = {}
  door_cache = {}
  local names = {}
  for _, name in ipairs(omsi.bus.triggers() or {}) do
    triggers[name:lower()] = true
    if not name:match("_off$") then names[#names + 1] = name end
  end
  table.sort(names, function(a, b) return a:lower() < b:lower() end)
  omsi.files.write("triggers.txt", table.concat(names, "\n"))
end

local function has(name)
  if not triggers then load_triggers() end
  return triggers[name:lower()] == true
end

-- Le bus a un trigger dont le nom contient ce mot.
local function has_like(word)
  if not triggers then load_triggers() end
  for t in pairs(triggers) do
    if t:find(word, 1, true) then return true end
  end
  return false
end

-- Le trigger de la porte n, comme les touches du pavé numérique d'OMSI : bus_doorfront0
-- pour la porte 1, bus_doorfront1 pour la 2... ; sinon un trigger du bus qui finit par
-- "Tuer_<n>" ou "door_<n>" (le C2 : C2_CP_BT_Tuer_3).
local function find_door_trigger(n)
  local name = "bus_doorfront" .. (n - 1)
  if has(name) then return name end
  local found = nil
  for t in pairs(triggers) do
    local l = t:lower()
    if (l:match("tuer_?" .. n .. "$") or l:match("door_?" .. n .. "$"))
        and not l:match("nothahn") and (not found or t < found) then
      found = t
    end
  end
  return found
end

local function door_trigger(n)
  if not triggers then load_triggers() end
  if door_cache[n] == nil then door_cache[n] = find_door_trigger(n) or false end
  return door_cache[n] or nil
end

-- Le bouton DEV : CG_active sur les bus français (Heuliez, Iveco, MAN...). Le C2 n'en a
-- pas ; sa libération des portes (Türfreigabe) est sur bus_dooraft.
local function dev_trigger()
  if has("CG_active") then return "CG_active" end
  if has_like("tuerfreigabe") and has("bus_dooraft") then return "bus_dooraft" end
  return nil
end

-- Le frein d'arrêt (break valve, bremse_halte) : bus_dooraft, la touche − du pavé
-- numérique d'OMSI - sauf sur le C2, où cette touche est la libération des portes.
local function stop_brake_trigger()
  if has_like("tuerfreigabe") then return nil end
  if has("bus_dooraft") then return "bus_dooraft" end
  return nil
end

-- Les variables qui disent si le DEV est actif, selon le bus.
local DEV_VARS = { "DEV", "CG_active", "C2_CP_BT_Tuerfreigabe", "C2_CP_Tuerfreigabe" }

local function dev_state()
  for _, name in ipairs(DEV_VARS) do
    local v = omsi.var(name)
    if v ~= nil then return v ~= 0 end
  end
  return nil
end

-- Combien de portes le bus a, d'après ses triggers de portes.
local function door_count()
  local n = 0
  while n < 8 and door_trigger(n + 1) do n = n + 1 end
  return n
end

-- Chaque porte ouverte ou non : par les variables de ses vantaux quand le bus les nomme
-- par porte, sinon d'après door_0, door_1... (deux vantaux par porte quand il y en a deux
-- fois plus que de portes, un sinon) ; nil quand on ne peut pas les répartir.
local function doorways()
  local count = door_count()
  if count == 0 then return nil end
  if leaf_vars[1] then
    local out = {}
    for n = 1, count do
      local open = false
      for _, name in ipairs(leaf_vars[n] or {}) do
        if (omsi.var(name) or 0) > 0.05 then open = true end
      end
      out[n] = open
    end
    return out
  end
  local leaves = omsi.bus.doors() or {}
  local per
  if #leaves == 2 * count then per = 2 elseif #leaves == count then per = 1 else return nil end
  local out = {}
  for n = 1, count do
    local open = false
    for k = (n - 1) * per + 1, n * per do
      if (leaves[k] or 0) > 0.05 then open = true end
    end
    out[n] = open
  end
  return out
end

-- Les variables suivies (watch.txt) ----------------------------------------------------

local watched = {}

local function load_watch()
  local text = omsi.files.read("watch.txt")
  watched = {}
  for name in (text or ""):gmatch("[^\r\n]+") do
    name = name:match("^%s*(.-)%s*$")
    if name ~= "" and #watched < 64 then watched[#watched + 1] = name end
  end
end

-- L'état envoyé au Stream Deck ---------------------------------------------------------

local function snapshot()
  local i = omsi.info()
  local msg = {
    v = VERSION,
    dir = data_dir,
    paused = i.paused,
    view = i.view,
    clock = i.clock,
  }
  local s = omsi.bus.state()
  if s then
    local vars = {}
    for _, name in ipairs(watched) do vars[name] = omsi.var(name) end
    msg.bus = {
      speed = s.speed,
      gear = s.gear,
      engine = bool(s.engine),
      rpm = s.rpm,
      electrics = bool(s.electrics),
      doors_open = bool(s.doors_open),
      doors = doorways(),
      dev = dev_state(),
      indicator = s.indicator,
      headlights = s.headlights,
      handbrake = bool(s.handbrake),
      horn = bool(s.horn),
      stop_request = bool(s.stop_request),
      fuel = s.fuel,
      passengers = s.passengers,
      interior_light = omsi.bus.interior_light(),
      kneeling = bool(omsi.bus.kneeling()),
      stop_brake = bool(omsi.bus.stop_brake()),
      limit = omsi.map.speed_limit(),
      model = i.vehicle_model,
      destination = i.destination,
      vars = next(vars) and vars or nil,
    }
  end
  if i.line then
    msg.duty = {
      line = i.line,
      tour = i.tour,
      delay = i.delay,
      next_stop = i.next_stop,
      next_stop_distance = i.next_stop_distance,
      at_stop = i.at_stop,
      terminus = i.terminus,
    }
  end
  return msg
end

local function push()
  omsi.send(PORT, omsi.json.encode(snapshot()))
end

-- Les commandes ----------------------------------------------------------------------

local VIEWS = { driver = true, pax = true, outside = true, map = true, ego = true }

local commands = {}

-- Porte n (de 1), comme sa touche : le trigger puis "<trigger>_off". 0 : toutes, par le
-- jeu (omsi.bus.toggle_door).
function commands.door(n)
  n = tonumber(n) or 0
  if n == 0 then return omsi.bus.toggle_door(0) end
  local name = door_trigger(n)
  if not name then return false end
  omsi.trigger(name)
  return true
end

function commands.dev()
  local name = dev_trigger()
  if not name then return false end
  omsi.trigger(name)
  return true
end

function commands.stopbrake()
  local name = stop_brake_trigger()
  if not name then return false end
  omsi.trigger(name)
  return true
end

-- Appuyer sur le clignotant déjà allumé l'éteint.
function commands.indicator(side)
  if side ~= "left" and side ~= "right" and side ~= "hazard" and side ~= "off" then
    return false
  end
  if omsi.bus.indicator() == side then side = "off" end
  return omsi.bus.set_indicator(side)
end

function commands.handbrake()
  return omsi.bus.toggle_handbrake()
end

function commands.engine()
  return omsi.bus.start_up() ~= nil
end

function commands.horn(down)
  return omsi.bus.sound_horn(down == "1")
end

function commands.interior()
  local on = (omsi.bus.interior_light() or 0) > 0.05
  return omsi.bus.set_interior_light(not on)
end

-- Une action des véhicules de keyboard.cfg ([vehicles]) : appuyée puis relâchée, ou
-- tenue ("1") puis relâchée ("0").
function commands.action(name, down)
  if not name then return false end
  if down == nil then return omsi.bus.action(name) end
  return omsi.bus.action(name, down == "1")
end

-- Une action du jeu de keyboard.cfg ([game]).
function commands.game(name)
  if not name then return false end
  return omsi.game.action(name)
end

-- Un trigger de script du bus : appuyé puis relâché, ou tenu ("1") puis relâché ("0").
function commands.trigger(name, down)
  if not name or not has(name) then return false end
  if down == "1" then
    omsi.press(name)
  elseif down == "0" then
    omsi.release(name)
  else
    omsi.trigger(name)
  end
  return true
end

function commands.view(name)
  if not VIEWS[name] then return false end
  return omsi.camera.set_view(name)
end

function commands.pause()
  return omsi.game.action("sim_pause")
end

local function run(line)
  local words = {}
  for w in line:gmatch("%S+") do words[#words + 1] = w end
  local id, name = words[1], words[2]
  if not id then return end
  local fn = name and commands[name]
  local ok = false
  if fn then
    local good, result = pcall(fn, table.unpack(words, 3))
    ok = good and result ~= false
    if not good then print("streamdeck: " .. line .. " : " .. tostring(result)) end
  end
  omsi.send(PORT, omsi.json.encode({ v = VERSION, ack = id, ok = ok }))
end

local function poll_inbox()
  local entries = omsi.files.list(INBOX)
  if not entries or #entries == 0 then return end
  table.sort(entries, function(a, b) return a.name < b.name end)
  local ran = false
  for _, e in ipairs(entries) do
    if not e.dir and e.name:sub(-4) == ".cmd" then
      local path = INBOX .. "/" .. e.name
      local text = omsi.files.read(path)
      omsi.files.delete(path)
      if text then
        run(text)
        ran = true
      end
    end
  end
  if ran then push() end
end

omsi.every(0.05, poll_inbox)
omsi.every(0.2, push)
omsi.every(1, load_watch)

-- Ce qui se voit sur les touches part tout de suite, sans attendre les 0,2 s.
for _, ev in ipairs({ "door", "doors", "indicator", "headlights", "handbrake", "horn",
                      "stop_request", "engine_start", "engine_stop", "gear", "next_stop",
                      "view", "duty" }) do
  omsi.on(ev, push)
end

omsi.on("vehicle", function()
  load_triggers()
  push()
end)

omsi.on("start", function()
  load_watch()
  load_triggers()
  push()
end)
