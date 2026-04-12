//------------------------------------------------------------------------------------------------
//! PlayerTracker - posts player state snapshots and gameplay events to a webhook URL.
//!
//! Attach to the game mode entity in Workbench. Server-only - no-op on clients.
//!
//! - Snapshot POST on a fixed interval: /track
//!     game, server_name, server_id, map, timestamp, session_time, counts, player array
//! - Instant event POSTs:                /event
//!     player_killed, player_joined, player_left, player_spawned
//!
//! All API calls verified against BohemiaInteractive/Arma-Reforger-Script-Diff.
//! JSON serialization uses JsonApiStruct so escaping and nesting are correct by construction.
//------------------------------------------------------------------------------------------------

//------------------------------------------------------------------------------------------------
//! Cache entry used by PlayerTrackerComponent's POI lookup.
class PTR_LocationEntry
{
	string m_sName;
	string m_sType;
	float  m_fX;
	float  m_fZ;
}

//------------------------------------------------------------------------------------------------
//! Nested "nearest_location" object inside each player snapshot.
class PTR_NearestLocationData : JsonApiStruct
{
	string name;
	string type;
	int    dist_m;

	void PTR_NearestLocationData()
	{
		RegV("name");
		RegV("type");
		RegV("dist_m");
	}
}

//------------------------------------------------------------------------------------------------
//! Per-player record inside the snapshot payload.
//! Bool fields are stored via OnPack() because JsonApiStruct RegV cannot register bools.
class PTR_PlayerData : JsonApiStruct
{
	string uid;
	string name;
	string status;
	string grid;
	string grid_10;
	float  x;
	float  z;
	float  elevation;
	int    heading;
	string heading_dir;
	string faction;
	float  health;
	string vehicle_type;
	int    squad_id;
	string squad_name;
	ref PTR_NearestLocationData nearest_location;

	// Bools - handled manually in OnPack()
	bool in_vehicle;
	bool is_squad_leader;
	bool is_admin;
	bool is_gm;

	void PTR_PlayerData()
	{
		RegV("uid");
		RegV("name");
		RegV("status");
		RegV("grid");
		RegV("grid_10");
		RegV("x");
		RegV("z");
		RegV("elevation");
		RegV("heading");
		RegV("heading_dir");
		RegV("faction");
		RegV("health");
		RegV("vehicle_type");
		RegV("squad_id");
		RegV("squad_name");
		RegV("nearest_location");
	}

	override void OnPack()
	{
		UnregV("in_vehicle");
		StoreBoolean("in_vehicle", in_vehicle);

		UnregV("is_squad_leader");
		StoreBoolean("is_squad_leader", is_squad_leader);

		UnregV("is_admin");
		StoreBoolean("is_admin", is_admin);

		UnregV("is_gm");
		StoreBoolean("is_gm", is_gm);
	}
}

//------------------------------------------------------------------------------------------------
//! Top-level /track payload. Auth is sent via the X-Api-Key header set on the RestContext.
class PTR_SnapshotPayload : JsonApiStruct
{
	string game;
	string server_name;
	string server_id;
	// "map" clashes with the EnScript built-in type name, store manually under the JSON key "map".
	string m_sMap;
	int    timestamp;
	int    session_time;
	int    players_alive;
	int    players_total;
	ref array<ref PTR_PlayerData> players;

	void PTR_SnapshotPayload()
	{
		RegV("game");
		RegV("server_name");
		RegV("server_id");
		RegV("timestamp");
		RegV("session_time");
		RegV("players_alive");
		RegV("players_total");
		RegV("players");
	}

	override void OnPack()
	{
		UnregV("m_sMap");
		StoreString("map", m_sMap);
	}
}

//------------------------------------------------------------------------------------------------
//! Shared player_joined / player_left payload body.
class PTR_ConnectionEventData : JsonApiStruct
{
	string uid;
	string name;
	string kick_group;
	string kick_reason;
	int    timeout_sec;

	void PTR_ConnectionEventData()
	{
		RegV("uid");
		RegV("name");
		RegV("kick_group");
		RegV("kick_reason");
		RegV("timeout_sec");
	}
}

//------------------------------------------------------------------------------------------------
//! player_killed payload body.
class PTR_KillEventData : JsonApiStruct
{
	string victim_uid;
	string victim_name;
	string victim_grid;
	string victim_grid_10;
	float  victim_x;
	float  victim_z;
	string victim_faction;
	string killer_name;
	string killer_faction;
	bool   is_teamkill;

	void PTR_KillEventData()
	{
		RegV("victim_uid");
		RegV("victim_name");
		RegV("victim_grid");
		RegV("victim_grid_10");
		RegV("victim_x");
		RegV("victim_z");
		RegV("victim_faction");
		RegV("killer_name");
		RegV("killer_faction");
	}

	override void OnPack()
	{
		UnregV("is_teamkill");
		StoreBoolean("is_teamkill", is_teamkill);
	}
}

//------------------------------------------------------------------------------------------------
//! vote_started / vote_cast / vote_ended payload body.
class PTR_VoteEventData : JsonApiStruct
{
	string vote_type;
	int    target_id;
	string target_name;
	int    voter_id;
	string voter_name;
	int    result;

	void PTR_VoteEventData()
	{
		RegV("vote_type");
		RegV("target_id");
		RegV("target_name");
		RegV("voter_id");
		RegV("voter_name");
		RegV("result");
	}
}

//------------------------------------------------------------------------------------------------
//! player_spawned payload body.
class PTR_SpawnEventData : JsonApiStruct
{
	string uid;
	string name;
	string grid;
	string grid_10;
	float  x;
	float  z;
	string faction;

	void PTR_SpawnEventData()
	{
		RegV("uid");
		RegV("name");
		RegV("grid");
		RegV("grid_10");
		RegV("x");
		RegV("z");
		RegV("faction");
	}
}

//------------------------------------------------------------------------------------------------
//! /event envelope carrying a typed "data" object.
//! The nested data member is stored manually in OnPack() so the envelope does not need
//! a separate subclass for each event type.
//! Auth is sent via the X-Api-Key header set on the RestContext.
class PTR_EventPayload : JsonApiStruct
{
	string server_id;
	int    timestamp;
	string event_type;

	// Not RegV'd - stored via StoreObject in OnPack().
	ref JsonApiStruct data;

	void PTR_EventPayload()
	{
		RegV("server_id");
		RegV("timestamp");
		RegV("event_type");
	}

	override void OnPack()
	{
		if (data)
			StoreObject("data", data);
	}
}

//------------------------------------------------------------------------------------------------
[ComponentEditorProps(category: "PlayerTracker", description: "Posts player state and gameplay events to a webhook URL.")]
class PlayerTrackerComponentClass : ScriptComponentClass
{
}

//------------------------------------------------------------------------------------------------
class PlayerTrackerComponent : ScriptComponent
{
	//-------------------------------------------------------------------------------------------------
	// Workbench attributes
	//-------------------------------------------------------------------------------------------------

	[Attribute("http://127.0.0.1:8000/", UIWidgets.EditBox, "Webhook base URL (trailing slash required)")]
	protected string m_sWebhookBaseUrl;

	[Attribute("api/tracker/track", UIWidgets.EditBox, "Snapshot POST path (no leading slash)")]
	protected string m_sTrackPath;

	[Attribute("api/tracker/event", UIWidgets.EditBox, "Event POST path (no leading slash)")]
	protected string m_sEventPath;

	[Attribute("changeme", UIWidgets.EditBox, "API key")]
	protected string m_sApiKey;

	[Attribute("10", UIWidgets.Slider, "Update interval (seconds)", "1 60 1")]
	protected float m_fUpdateInterval;

	[Attribute("1", UIWidgets.CheckBox, "Enable tracker")]
	protected bool m_bEnabled;

	[Attribute("0", UIWidgets.CheckBox, "Verbose logging")]
	protected bool m_bVerbose;

	//-------------------------------------------------------------------------------------------------
	// Runtime state
	//-------------------------------------------------------------------------------------------------

	protected string m_sServerId;
	protected string m_sServerName;
	protected string m_sMapName;

	// RestContext is not ref - it is borrowed from GetRestApi().GetContext().
	protected RestContext m_pRestCtx;

	// RestCallback instances MUST be ref, otherwise they are GC'd after their first use.
	protected ref RestCallback m_pTrackCallback;
	protected ref RestCallback m_pEventCallback;

	protected float m_fTimer;

	protected ref array<ref PTR_LocationEntry> m_aPOICache;
	protected int m_iPOIRetryCount;

	protected const float POI_MAX_DIST = 2000.0;
	protected const int   POI_MAX_RETRIES = 10;

	protected SCR_VotingManagerComponent m_pVotingMgr;

	//-------------------------------------------------------------------------------------------------
	// Lifecycle
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	override void OnPostInit(IEntity owner)
	{
		super.OnPostInit(owner);

		if (!Replication.IsServer())
			return;

		if (!m_bEnabled)
			return;

		m_aPOICache = new array<ref PTR_LocationEntry>();

		m_pTrackCallback = new RestCallback();
		m_pTrackCallback.SetOnSuccess(OnRestSuccess);
		m_pTrackCallback.SetOnError(OnTrackError);

		m_pEventCallback = new RestCallback();
		m_pEventCallback.SetOnSuccess(OnRestSuccess);
		m_pEventCallback.SetOnError(OnEventError);

		m_pRestCtx = GetGame().GetRestApi().GetContext(m_sWebhookBaseUrl);
		// SetHeaders only reliably handles one header pair - pass the API key
		// via query string instead (?key=...) since the backend accepts both.
		m_pRestCtx.SetHeaders("Content-Type,application/json");

		// Resolve server identity from DSConfig. publicAddress:publicPort is globally
		// unique (it's the endpoint clients connect to) and stable across restarts -
		// strictly better than a manually entered ID or a PID.
		m_sServerId   = "unknown:0";
		m_sServerName = m_sServerId;

		DSConfig cfg = new DSConfig();
		if (GetGame().GetBackendApi().GetRunningDSConfig(cfg))
		{
			if (cfg.publicAddress.Length() > 0 && cfg.publicPort > 0)
				m_sServerId = cfg.publicAddress + ":" + cfg.publicPort.ToString();
			else if (cfg.bindAddress.Length() > 0 && cfg.bindPort > 0)
				m_sServerId = cfg.bindAddress + ":" + cfg.bindPort.ToString();

			if (cfg.game && cfg.game.name.Length() > 0)
				m_sServerName = cfg.game.name;
			else
				m_sServerName = m_sServerId;
		}
		else
		{
			Print("[PlayerTracker] DSConfig unavailable - reporting as 'unknown:0' (not running on a dedicated server?)", LogLevel.WARNING);
		}

		// "worlds/Everon/Everon.ent" -> "Everon"
		m_sMapName = StripPathAndExtension(GetGame().GetWorldFile());

		// Map descriptors are static - load the POI cache once at init.
		LoadPOICache();

		SCR_BaseGameMode gameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
		if (gameMode)
		{
			gameMode.GetOnPlayerKilled().Insert(OnPlayerKilled);
			gameMode.GetOnPlayerConnected().Insert(OnPlayerConnected);
			gameMode.GetOnPlayerDisconnected().Insert(OnPlayerDisconnected);
			gameMode.GetOnPlayerSpawned().Insert(OnPlayerSpawned);

			m_pVotingMgr = SCR_VotingManagerComponent.Cast(gameMode.FindComponent(SCR_VotingManagerComponent));
			if (m_pVotingMgr)
			{
				m_pVotingMgr.GetOnVotingStart().Insert(OnVoteStarted);
				m_pVotingMgr.GetOnVote().Insert(OnVoteCast);
				m_pVotingMgr.GetOnVotingEnd().Insert(OnVoteEnded);
				Print("[PlayerTracker] Voting manager hooked", LogLevel.NORMAL);
			}
			else
			{
				Print("[PlayerTracker] No voting manager on this game mode - vote events disabled", LogLevel.NORMAL);
			}
		}

		// Required - without this EOnFrame never fires.
		SetEventMask(owner, EntityEvent.FRAME);

		if (m_bVerbose)
			Print("[PlayerTracker] Initialised - server: " + m_sServerName + " map: " + m_sMapName, LogLevel.NORMAL);
	}

	//------------------------------------------------------------------------------------------------
	override void OnDelete(IEntity owner)
	{
		// Game mode invokers hold strong refs to our methods. Without removal, a teardown
		// before the game mode is destroyed leaves dangling pointers.
		SCR_BaseGameMode gameMode = SCR_BaseGameMode.Cast(GetGame().GetGameMode());
		if (gameMode)
		{
			gameMode.GetOnPlayerKilled().Remove(OnPlayerKilled);
			gameMode.GetOnPlayerConnected().Remove(OnPlayerConnected);
			gameMode.GetOnPlayerDisconnected().Remove(OnPlayerDisconnected);
			gameMode.GetOnPlayerSpawned().Remove(OnPlayerSpawned);
		}

		if (m_pVotingMgr)
		{
			m_pVotingMgr.GetOnVotingStart().Remove(OnVoteStarted);
			m_pVotingMgr.GetOnVote().Remove(OnVoteCast);
			m_pVotingMgr.GetOnVotingEnd().Remove(OnVoteEnded);
			m_pVotingMgr = null;
		}

		super.OnDelete(owner);
	}

	//------------------------------------------------------------------------------------------------
	override void EOnFrame(IEntity owner, float timeSlice)
	{
		if (!Replication.IsServer() || !m_bEnabled)
			return;

		m_fTimer += timeSlice;

		if (m_fTimer >= m_fUpdateInterval)
		{
			m_fTimer = 0;
			PostSnapshot();
		}
	}

	//-------------------------------------------------------------------------------------------------
	// REST callbacks
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	protected void OnRestSuccess(RestCallback cb)
	{
	}

	//------------------------------------------------------------------------------------------------
	protected void OnTrackError(RestCallback cb)
	{
		Print("[PlayerTracker] /track error rest=" + cb.GetRestResult() + " http=" + cb.GetHttpCode() + " data=" + cb.GetData(), LogLevel.WARNING);
	}

	//------------------------------------------------------------------------------------------------
	protected void OnEventError(RestCallback cb)
	{
		Print("[PlayerTracker] /event error rest=" + cb.GetRestResult() + " http=" + cb.GetHttpCode() + " data=" + cb.GetData(), LogLevel.WARNING);
	}

	//-------------------------------------------------------------------------------------------------
	// Game mode event hooks
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	protected void OnPlayerKilled(notnull SCR_InstigatorContextData instigatorData)
	{
		int victimId = instigatorData.GetVictimPlayerID();
		int killerId = instigatorData.GetKillerPlayerID();

		PTR_KillEventData data = new PTR_KillEventData();
		data.victim_uid  = SCR_PlayerIdentityUtils.GetPlayerIdentityId(victimId);
		data.victim_name = GetGame().GetPlayerManager().GetPlayerName(victimId);

		IEntity victimEntity = instigatorData.GetVictimEntity();
		if (victimEntity)
		{
			vector pos = victimEntity.GetOrigin();
			data.victim_x      = pos[0];
			data.victim_z      = pos[2];
			data.victim_grid   = BuildGrid8(pos[0], pos[2]);
			data.victim_grid_10 = BuildGrid10(pos[0], pos[2]);
			data.victim_faction = GetEntityFactionKey(victimEntity);
		}

		IEntity killerEntity = instigatorData.GetKillerEntity();
		if (killerId > 0)
		{
			data.killer_name = GetGame().GetPlayerManager().GetPlayerName(killerId);
			IEntity killerControlled = GetGame().GetPlayerManager().GetPlayerControlledEntity(killerId);
			if (killerControlled)
				data.killer_faction = GetEntityFactionKey(killerControlled);
			else if (killerEntity)
				data.killer_faction = GetEntityFactionKey(killerEntity);
		}
		else if (killerEntity)
		{
			// Environmental or AI kill - fall back to killer entity's prefab name.
			if (killerEntity.GetPrefabData())
				data.killer_name = StripPathAndExtension(killerEntity.GetPrefabData().GetPrefabName());
			data.killer_faction = GetEntityFactionKey(killerEntity);
		}

		data.is_teamkill = false;
		if (killerId > 0 && killerId != victimId
			&& data.victim_faction.Length() > 0
			&& data.killer_faction.Length() > 0
			&& data.victim_faction == data.killer_faction)
		{
			data.is_teamkill = true;
		}

		PostEvent("player_killed", data);
	}

	//------------------------------------------------------------------------------------------------
	protected string GetEntityFactionKey(IEntity ent)
	{
		if (!ent)
			return "";
		FactionAffiliationComponent fac = FactionAffiliationComponent.Cast(ent.FindComponent(FactionAffiliationComponent));
		if (!fac)
			return "";
		Faction f = fac.GetAffiliatedFaction();
		if (!f)
			return "";
		return f.GetFactionKey();
	}

	//------------------------------------------------------------------------------------------------
	protected void OnPlayerConnected(int playerId)
	{
		PTR_ConnectionEventData data = new PTR_ConnectionEventData();
		data.uid  = SCR_PlayerIdentityUtils.GetPlayerIdentityId(playerId);
		data.name = GetGame().GetPlayerManager().GetPlayerName(playerId);

		PostEvent("player_joined", data);
	}

	//------------------------------------------------------------------------------------------------
	protected void OnPlayerDisconnected(int playerId, KickCauseCode cause, int timeout)
	{
		PTR_ConnectionEventData data = new PTR_ConnectionEventData();
		data.uid  = SCR_PlayerIdentityUtils.GetPlayerIdentityId(playerId);
		data.name = GetGame().GetPlayerManager().GetPlayerName(playerId);
		data.timeout_sec = timeout;

		if (cause)
		{
			KickCauseGroup2 groupInt = KickCauseCodeAPI.GetGroup(cause);
			int reasonInt = KickCauseCodeAPI.GetReason(cause);
			GetGame().GetFullKickReason(cause, groupInt, reasonInt, data.kick_group, data.kick_reason);
		}

		PostEvent("player_left", data);
	}

	//------------------------------------------------------------------------------------------------
	protected void OnPlayerSpawned(int playerId, IEntity controlledEntity)
	{
		PTR_SpawnEventData data = new PTR_SpawnEventData();
		data.uid  = SCR_PlayerIdentityUtils.GetPlayerIdentityId(playerId);
		data.name = GetGame().GetPlayerManager().GetPlayerName(playerId);

		if (controlledEntity)
		{
			vector pos = controlledEntity.GetOrigin();
			data.x       = pos[0];
			data.z       = pos[2];
			data.grid    = BuildGrid8(pos[0], pos[2]);
			data.grid_10 = BuildGrid10(pos[0], pos[2]);

			FactionAffiliationComponent fac = FactionAffiliationComponent.Cast(controlledEntity.FindComponent(FactionAffiliationComponent));
			if (fac && fac.GetAffiliatedFaction())
				data.faction = fac.GetAffiliatedFaction().GetFactionKey();
		}

		PostEvent("player_spawned", data);
	}

	//-------------------------------------------------------------------------------------------------
	// Voting manager hooks
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	protected void OnVoteStarted(EVotingType type, int value)
	{
		PTR_VoteEventData data = BuildVoteData(type, value, -1);
		PostEvent("vote_started", data);
	}

	//------------------------------------------------------------------------------------------------
	protected void OnVoteCast(EVotingType type, int value, int voterId)
	{
		PTR_VoteEventData data = BuildVoteData(type, value, voterId);
		PostEvent("vote_cast", data);
	}

	//------------------------------------------------------------------------------------------------
	protected void OnVoteEnded(EVotingType type, int value, int winner)
	{
		PTR_VoteEventData data = BuildVoteData(type, value, -1);
		data.result = winner;
		PostEvent("vote_ended", data);
	}

	//------------------------------------------------------------------------------------------------
	protected PTR_VoteEventData BuildVoteData(EVotingType type, int value, int voterId)
	{
		PTR_VoteEventData data = new PTR_VoteEventData();
		data.vote_type = VoteTypeToString(type);
		data.target_id = value;

		PlayerManager pm = GetGame().GetPlayerManager();
		if (VoteTypeHasPlayerTarget(type) && value > 0 && pm)
			data.target_name = pm.GetPlayerName(value);

		if (voterId > 0 && pm)
		{
			data.voter_id   = voterId;
			data.voter_name = pm.GetPlayerName(voterId);
		}
		else
		{
			data.voter_id = -1;
		}

		data.result = -1;
		return data;
	}

	//------------------------------------------------------------------------------------------------
	protected string VoteTypeToString(EVotingType type)
	{
		if (type == EVotingType.KICK)               return "KICK";
		if (type == EVotingType.ADMIN)              return "ADMIN";
		if (type == EVotingType.EDITOR_IN)          return "EDITOR_IN";
		if (type == EVotingType.EDITOR_OUT)         return "EDITOR_OUT";
		if (type == EVotingType.EDITOR_WITHDRAW)    return "EDITOR_WITHDRAW";
		if (type == EVotingType.RESTART)            return "RESTART";
		if (type == EVotingType.WORLD)              return "WORLD";
		if (type == EVotingType.AUTO_LIGHTBAN)      return "AUTO_LIGHTBAN";
		if (type == EVotingType.AUTO_HEAVYBAN)      return "AUTO_HEAVYBAN";
		if (type == EVotingType.AUTO_KICK)          return "AUTO_KICK";
		if (type == EVotingType.COMMANDER)          return "COMMANDER";
		if (type == EVotingType.COMMANDER_WITHDRAW) return "COMMANDER_WITHDRAW";
		if (type == EVotingType.GROUP_LEADER)       return "GROUP_LEADER";
		return "UNKNOWN";
	}

	//------------------------------------------------------------------------------------------------
	protected bool VoteTypeHasPlayerTarget(EVotingType type)
	{
		if (type == EVotingType.RESTART) return false;
		if (type == EVotingType.WORLD)   return false;
		return true;
	}

	//-------------------------------------------------------------------------------------------------
	// Snapshot
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	protected void PostSnapshot()
	{
		BaseWorld world = GetGame().GetWorld();
		if (!world)
			return;

		// GetWorldTime() returns world lifetime in milliseconds (float). Floor to whole seconds.
		int sessionTimeSec = Math.Floor(world.GetWorldTime() / 1000);

		PlayerManager pm = GetGame().GetPlayerManager();
		array<int> playerIds = new array<int>();
		pm.GetPlayers(playerIds);

		PTR_SnapshotPayload payload = new PTR_SnapshotPayload();
		payload.game          = "ArmaReforger";
		payload.server_name   = m_sServerName;
		payload.server_id     = m_sServerId;
		payload.m_sMap        = m_sMapName;
		payload.timestamp     = System.GetUnixTime();
		payload.session_time  = sessionTimeSec;
		payload.players_total = playerIds.Count();
		payload.players_alive = 0;
		payload.players       = new array<ref PTR_PlayerData>();

		// Lazy POI retry - on custom maps the world may not be fully streamed at OnPostInit.
		if (m_aPOICache.Count() == 0 && m_iPOIRetryCount < POI_MAX_RETRIES)
		{
			m_iPOIRetryCount++;
			Print("[PlayerTracker] POI cache empty - retry " + m_iPOIRetryCount.ToString() + "/" + POI_MAX_RETRIES.ToString(), LogLevel.NORMAL);
			LoadPOICache();
		}

		foreach (int pid : playerIds)
		{
			PTR_PlayerData pd = BuildPlayerData(pid, pm);
			if (pd.status == "alive")
				payload.players_alive += 1;

			payload.players.Insert(pd);
		}

		payload.Pack();
		m_pRestCtx.POST(m_pTrackCallback, m_sTrackPath + "?key=" + m_sApiKey, payload.AsString());

		if (m_bVerbose)
			Print("[PlayerTracker] Snapshot posted - " + payload.players_total.ToString() + " players", LogLevel.NORMAL);
	}

	//------------------------------------------------------------------------------------------------
	protected PTR_PlayerData BuildPlayerData(int pid, PlayerManager pm)
	{
		PTR_PlayerData pd = new PTR_PlayerData();
		pd.nearest_location = new PTR_NearestLocationData();
		pd.nearest_location.dist_m = -1;

		pd.uid  = SCR_PlayerIdentityUtils.GetPlayerIdentityId(pid);
		pd.name = pm.GetPlayerName(pid);

		IEntity pEntity = pm.GetPlayerControlledEntity(pid);

		// Default values for an unspawned player.
		pd.status   = "unspawned";
		pd.squad_id = -1;

		if (pEntity)
		{
			// Status + health
			DamageManagerComponent dmg = DamageManagerComponent.Cast(pEntity.FindComponent(DamageManagerComponent));
			if (dmg)
			{
				if (dmg.IsDestroyed())
				{
					pd.status = "dead";
				}
				else
				{
					pd.status = "alive";
				}
				pd.health = dmg.GetHealthScaled();
			}
			else
			{
				pd.status = "alive";
				pd.health = 1.0;
			}

			// Position + grid
			vector pos = pEntity.GetOrigin();
			pd.x         = pos[0];
			pd.elevation = pos[1];
			pd.z         = pos[2];
			pd.grid      = BuildGrid8(pos[0], pos[2]);
			pd.grid_10   = BuildGrid10(pos[0], pos[2]);

			// Heading - GetYawPitchRoll returns degrees, yaw in X component.
			vector ypr = pEntity.GetYawPitchRoll();
			int yawDeg = ypr[0];
			pd.heading     = NormalizeHeading(yawDeg);
			pd.heading_dir = HeadingToDir(pd.heading);

			// Faction
			FactionAffiliationComponent fac = FactionAffiliationComponent.Cast(pEntity.FindComponent(FactionAffiliationComponent));
			if (fac && fac.GetAffiliatedFaction())
				pd.faction = fac.GetAffiliatedFaction().GetFactionKey();

			// Vehicle - CompartmentAccessComponent.GetVehicleIn is the canonical lookup.
			IEntity vehicle = CompartmentAccessComponent.GetVehicleIn(pEntity);
			if (vehicle)
			{
				pd.in_vehicle = true;
				EntityPrefabData prefabData = vehicle.GetPrefabData();
				if (prefabData)
					pd.vehicle_type = StripPathAndExtension(prefabData.GetPrefabName());
			}

			// Nearest POI
			FindNearestLocation(pos[0], pos[2], pd.nearest_location);
		}

		// Squad
		SCR_GroupsManagerComponent gm = SCR_GroupsManagerComponent.GetInstance();
		if (gm)
		{
			SCR_AIGroup group = gm.GetPlayerGroup(pid);
			if (group)
			{
				pd.squad_id = group.GetGroupID();
				string customName = group.GetCustomName();
				if (customName.Length() > 0)
					pd.squad_name = customName;
				else
					pd.squad_name = "Squad " + pd.squad_id.ToString();
				pd.is_squad_leader = (group.GetLeaderID() == pid);
			}
		}

		// Admin / GM
		pd.is_admin = GetGame().GetBackendApi().IsListedServerAdmin(pid);
		pd.is_gm    = pm.HasPlayerRole(pid, EPlayerRole.GAME_MASTER);

		return pd;
	}

	//------------------------------------------------------------------------------------------------
	protected void PostEvent(string eventType, JsonApiStruct data)
	{
		PTR_EventPayload payload = new PTR_EventPayload();
		payload.server_id  = m_sServerId;
		payload.timestamp  = System.GetUnixTime();
		payload.event_type = eventType;
		payload.data       = data;

		payload.Pack();
		m_pRestCtx.POST(m_pEventCallback, m_sEventPath + "?key=" + m_sApiKey, payload.AsString());

		if (m_bVerbose)
			Print("[PlayerTracker] Event posted - " + eventType, LogLevel.NORMAL);
	}

	//-------------------------------------------------------------------------------------------------
	// POI cache
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	protected void LoadPOICache()
	{
		m_aPOICache.Clear();

		BaseWorld world = GetGame().GetWorld();
		if (!world)
		{
			Print("[PlayerTracker] POI cache load skipped - no world", LogLevel.WARNING);
			return;
		}

		vector mins, maxs;
		world.GetBoundBox(mins, maxs);
		world.QueryEntitiesByAABB(mins, maxs, OnPOIEntityFound, null, EQueryEntitiesFlags.STATIC);

		Print("[PlayerTracker] POI cache loaded - " + m_aPOICache.Count().ToString() + " entries (world bounds " + mins.ToString() + " .. " + maxs.ToString() + ")", LogLevel.NORMAL);
	}

	//------------------------------------------------------------------------------------------------
	protected bool OnPOIEntityFound(IEntity entity)
	{
		MapDescriptorComponent md = MapDescriptorComponent.Cast(entity.FindComponent(MapDescriptorComponent));
		if (!md)
			return true;

		int mdType = md.GetBaseType();
		if (!IsInterestingPOI(mdType))
			return true;

		// Item() is documented as "use with moderation" - cache the single call.
		MapItem item = md.Item();
		if (!item)
			return true;

		string displayName = item.GetDisplayName();
		if (displayName.IsEmpty())
			return true;

		PTR_LocationEntry entry = new PTR_LocationEntry();
		entry.m_sName = displayName;
		entry.m_sType = MapDescriptorTypeToString(mdType);
		vector pos    = entity.GetOrigin();
		entry.m_fX    = pos[0];
		entry.m_fZ    = pos[2];

		m_aPOICache.Insert(entry);
		return true;
	}

	//------------------------------------------------------------------------------------------------
	protected bool IsInterestingPOI(int mdType)
	{
		if (mdType == EMapDescriptorType.MDT_NAME_CITY)    return true;
		if (mdType == EMapDescriptorType.MDT_NAME_TOWN)    return true;
		if (mdType == EMapDescriptorType.MDT_NAME_VILLAGE) return true;
		if (mdType == EMapDescriptorType.MDT_NAME_LOCAL)   return true;
		if (mdType == EMapDescriptorType.MDT_NAME_HILL)    return true;
		if (mdType == EMapDescriptorType.MDT_AIRPORT)      return true;
		return false;
	}

	//------------------------------------------------------------------------------------------------
	protected string MapDescriptorTypeToString(int t)
	{
		if (t == EMapDescriptorType.MDT_NAME_CITY)    return "city";
		if (t == EMapDescriptorType.MDT_NAME_TOWN)    return "town";
		if (t == EMapDescriptorType.MDT_NAME_VILLAGE) return "village";
		if (t == EMapDescriptorType.MDT_NAME_LOCAL)   return "local";
		if (t == EMapDescriptorType.MDT_NAME_HILL)    return "hill";
		if (t == EMapDescriptorType.MDT_AIRPORT)      return "airport";
		return "landmark";
	}

	//------------------------------------------------------------------------------------------------
	protected void FindNearestLocation(float px, float pz, notnull PTR_NearestLocationData out_data)
	{
		out_data.name   = "";
		out_data.type   = "";
		out_data.dist_m = -1;

		float bestDist2 = POI_MAX_DIST * POI_MAX_DIST;

		foreach (PTR_LocationEntry entry : m_aPOICache)
		{
			float dx    = px - entry.m_fX;
			float dz    = pz - entry.m_fZ;
			float dist2 = dx * dx + dz * dz;

			if (dist2 < bestDist2)
			{
				bestDist2       = dist2;
				out_data.name   = entry.m_sName;
				out_data.type   = entry.m_sType;
				out_data.dist_m = Math.Sqrt(dist2);
			}
		}
	}

	//-------------------------------------------------------------------------------------------------
	// Grid helpers
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	//! 8-digit grid at 10m precision. x=6283.4 -> "0628"
	protected string BuildGrid8(float x, float z)
	{
		int gx = x / 10;
		int gz = z / 10;
		return PadInt(gx, 4) + "-" + PadInt(gz, 4);
	}

	//------------------------------------------------------------------------------------------------
	//! 10-digit grid at 1m precision. x=6283.4 -> "06283"
	protected string BuildGrid10(float x, float z)
	{
		int gx = x;
		int gz = z;
		return PadInt(gx, 5) + "-" + PadInt(gz, 5);
	}

	//------------------------------------------------------------------------------------------------
	protected string PadInt(int value, int minWidth)
	{
		string s = value.ToString();
		while (s.Length() < minWidth)
			s = "0" + s;
		return s;
	}

	//-------------------------------------------------------------------------------------------------
	// Heading helpers
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	//! Normalize an arbitrary integer degree value into [0, 360).
	//! EnScript's `%` operator is unreliable on ints - use loop-based normalization.
	protected int NormalizeHeading(int deg)
	{
		while (deg < 0)
			deg += 360;
		while (deg >= 360)
			deg -= 360;
		return deg;
	}

	//------------------------------------------------------------------------------------------------
	protected string HeadingToDir(int deg)
	{
		if (deg < 23)  return "N";
		if (deg < 68)  return "NE";
		if (deg < 113) return "E";
		if (deg < 158) return "SE";
		if (deg < 203) return "S";
		if (deg < 248) return "SW";
		if (deg < 293) return "W";
		if (deg < 338) return "NW";
		return "N";
	}

	//-------------------------------------------------------------------------------------------------
	// String helpers
	//-------------------------------------------------------------------------------------------------

	//------------------------------------------------------------------------------------------------
	//! Strip path prefix and file extension.
	//!   "worlds/Everon/Everon.ent"                              -> "Everon"
	//!   "$ArmaReforger:Prefabs/Vehicles/Wheeled/HMMWV/HMMWV.et" -> "HMMWV"
	protected string StripPathAndExtension(string path)
	{
		if (path.IsEmpty())
			return "";

		int lastSlash = -1;
		int i = 0;
		while (i < path.Length())
		{
			string ch = path.Get(i);
			if (ch == "/" || ch == "\\")
				lastSlash = i;
			i += 1;
		}

		string name;
		if (lastSlash >= 0)
			name = path.Substring(lastSlash + 1, path.Length() - lastSlash - 1);
		else
			name = path;

		int lastDot = -1;
		i = 0;
		while (i < name.Length())
		{
			if (name.Get(i) == ".")
				lastDot = i;
			i += 1;
		}

		if (lastDot > 0)
			name = name.Substring(0, lastDot);

		return name;
	}
}
