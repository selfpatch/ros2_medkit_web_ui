/**
 * SOVD Entity types for discovery endpoints
 */

/**
 * SOVD Resource Entity Type for API endpoints
 */
export type SovdResourceEntityType = 'areas' | 'components' | 'apps' | 'functions';

/**
 * QoS profile for a topic endpoint
 */
export interface QosProfile {
    reliability: 'reliable' | 'best_effort' | 'system_default' | 'best_available' | 'unknown';
    durability: 'volatile' | 'transient_local' | 'system_default' | 'best_available' | 'unknown';
    history: 'keep_last' | 'keep_all' | 'system_default' | 'unknown';
    depth: number;
    liveliness: 'automatic' | 'manual_by_topic' | 'system_default' | 'best_available' | 'unknown';
}

/**
 * Topic endpoint (publisher or subscriber) with QoS info
 */
export interface TopicEndpoint {
    node_name: string;
    node_namespace: string;
    fqn: string;
    qos: QosProfile;
}

/**
 * Topics associated with a component (node) - publishes and subscribes lists
 */
export interface ComponentTopicsInfo {
    /** Topics this component publishes to */
    publishes: string[];
    /** Topics this component subscribes to */
    subscribes: string[];
}

/**
 * Base entity from discovery endpoint
 */
export interface SovdEntity {
    /** Unique identifier */
    id: string;
    /** Display name */
    name: string;
    /** Entity type (e.g., "component", "application", "signal") */
    type: string;
    /** API path for this entity */
    href: string;
    /** Whether this entity has children that can be expanded */
    hasChildren?: boolean;
    /** Component's topics info (publishes/subscribes) - present for components */
    topicsInfo?: ComponentTopicsInfo;
}

/**
 * Full entity details (response from GET /entities/{path})
 */
export interface SovdEntityDetails extends SovdEntity {
    /**
     * Full topic data array with rich metadata (QoS, publishers, subscribers, schema).
     * Used for component detail view when full topic information is available.
     * Prefer this over topicsInfo when available as it contains more detailed information.
     */
    topics?: ComponentTopic[];
    /** Single topic data (when viewing a topic entity directly) */
    topicData?: ComponentTopic;
    /**
     * Lightweight topic lists (publishes/subscribes arrays of topic names).
     * Used for navigation and tree display. Falls back to this when full topics
     * array is not available. Does not contain QoS or publisher information.
     */
    topicsInfo?: ComponentTopicsInfo;
    /** Error message if fetching details failed */
    error?: string;
    /** ROS message type (preserved separately when entity type is 'topic') */
    rosType?: string;
    /** Additional properties vary by entity type */
    [key: string]: unknown;
}

/**
 * API response wrapper for entity lists
 */
export interface SovdEntitiesResponse {
    entities: SovdEntity[];
}

/**
 * Connection state for the SOVD server
 */
export interface ConnectionState {
    serverUrl: string | null;
    isConnected: boolean;
    isConnecting: boolean;
    error: string | null;
}

/**
 * Entity tree node with loading state
 */
export interface EntityTreeNode extends SovdEntity {
    children?: EntityTreeNode[];
    isLoading?: boolean;
    isExpanded?: boolean;
    path: string;
    /**
     * Raw data associated with the entity.
     * - For topic nodes created from topicsInfo: contains TopicNodeData
     *   with { topic, isPublisher, isSubscriber } for tree icon display.
     * - For topic nodes fetched from API: contains full ComponentTopic data
     *   with type, schema, QoS, publishers, subscribers, etc.
     * Use type guards to distinguish between these two shapes.
     */
    data?: unknown;
}

/**
 * Topic node data when created from topicsInfo
 */
export interface TopicNodeData {
    topic: string;
    isPublisher: boolean;
    isSubscriber: boolean;
}

/**
 * Component topic data from GET /components/{id}/data
 */
export interface ComponentTopic {
    /** Full topic path */
    topic: string;
    /** Timestamp in nanoseconds */
    timestamp: number;
    /** Topic message data (present when status='data') */
    data: unknown;
    /** Status indicating if actual data or only metadata is available */
    status?: 'data' | 'metadata_only';
    /** ROS 2 message type name (e.g., "sensor_msgs/msg/Temperature") */
    type?: string;
    /** Type information including schema and default values */
    type_info?: TopicTypeInfo;
    /** Number of publishers for this topic */
    publisher_count?: number;
    /** Number of subscribers for this topic */
    subscriber_count?: number;
    /** List of publisher endpoints with QoS */
    publishers?: TopicEndpoint[];
    /** List of subscriber endpoints with QoS */
    subscribers?: TopicEndpoint[];
    /** Whether this node publishes to the topic */
    isPublisher?: boolean;
    /** Whether this node subscribes to the topic */
    isSubscriber?: boolean;
    /** Unique key combining topic and direction for React key */
    uniqueKey?: string;
}

/**
 * API response for data item from GET /components/{id}/data/{dataId}
 * This is the raw response structure from the gateway API.
 */
export interface DataItemResponse {
    /** Data payload */
    data: unknown;
    /** Item identifier */
    id: string;
    /** Extended metadata from ros2_medkit gateway */
    'x-medkit'?: {
        ros2?: {
            type?: string;
            topic?: string;
            direction?: string;
        };
        timestamp?: number;
        status?: string;
        publisher_count?: number;
        subscriber_count?: number;
        /** Publisher endpoint information */
        publishers?: TopicEndpoint[];
        /** Subscriber endpoint information */
        subscribers?: TopicEndpoint[];
        /** Type information including schema (JSON schema for message fields) */
        type_info?: {
            schema?: Record<string, unknown>;
            default_value?: unknown;
        };
    };
}

/**
 * Type information for a ROS 2 message type
 */
export interface TopicTypeInfo {
    /** JSON schema describing field types */
    schema: TopicSchema;
    /** Default values for all fields */
    default_value: Record<string, unknown>;
}

/**
 * Schema entry for a single field
 */
export interface SchemaFieldType {
    /** Primitive type name (e.g., "double", "int32", "string", "bool") or nested type path */
    type: string;
    /** For nested message types, contains the fields of that type */
    fields?: TopicSchema;
    /** For array types, describes the item type */
    items?: SchemaFieldType;
    /** For fixed-size arrays */
    size?: number;
    /** For bounded sequences */
    max_size?: number;
    /** For bounded strings */
    max_length?: number;
}

/**
 * Schema mapping field names to their type information
 */
export type TopicSchema = Record<string, SchemaFieldType>;

/**
 * Request to publish to a component topic via PUT
 */
export interface ComponentTopicPublishRequest {
    /** Message type (e.g., "geometry_msgs/msg/Twist") */
    type: string;
    /** Message data as JSON */
    data: unknown;
}

// =============================================================================
// CONFIGURATIONS (ROS 2 Parameters)
// =============================================================================

/**
 * Parameter type from ROS 2
 */
export type ParameterType =
    | 'bool'
    | 'int'
    | 'double'
    | 'string'
    | 'byte_array'
    | 'bool_array'
    | 'int_array'
    | 'double_array'
    | 'string_array';

/**
 * Single parameter info from configurations endpoint
 */
export interface Parameter {
    /** Parameter name */
    name: string;
    /** Current parameter value */
    value: unknown;
    /** Parameter type (bool, int, double, string, arrays) */
    type: ParameterType;
    /** Optional description of the parameter */
    description?: string;
    /** Whether the parameter is read-only */
    read_only?: boolean;
}

/**
 * Response from GET /components/{id}/configurations
 */
export interface ComponentConfigurations {
    component_id: string;
    node_name: string;
    parameters: Parameter[];
}

/**
 * Response from GET /components/{id}/configurations/{param}
 */
export interface ConfigurationDetail {
    component_id: string;
    parameter: Parameter;
}

/**
 * Request body for PUT /components/{id}/configurations/{param}
 */
export interface SetConfigurationRequest {
    value: unknown;
}

/**
 * Response from PUT /components/{id}/configurations/{param}
 */
export interface SetConfigurationResponse {
    status: 'success' | 'error';
    component_id: string;
    parameter: Parameter;
    error?: string;
}

/**
 * Response from DELETE /components/{id}/configurations/{param}
 * Reset single parameter to default value
 */
export interface ResetConfigurationResponse {
    name: string;
    value: unknown;
    type: ParameterType;
    reset_to_default: boolean;
}

/**
 * Response from DELETE /components/{id}/configurations
 * Reset all parameters to default values
 */
export interface ResetAllConfigurationsResponse {
    node_name: string;
    reset_count: number;
    failed_count: number;
    failed_parameters?: string[];
}

// =============================================================================
// OPERATIONS (ROS 2 Services & Actions)
// =============================================================================

/**
 * Operation kind - service is sync, action is async
 */
export type OperationKind = 'service' | 'action';

/**
 * Service schema with request and response types
 */
export interface ServiceSchema {
    request: TopicSchema;
    response: TopicSchema;
}

/**
 * Action schema with goal, result, and feedback types
 */
export interface ActionSchema {
    goal: TopicSchema;
    result: TopicSchema;
    feedback: TopicSchema;
}

/**
 * Type information for an operation (service or action)
 */
export interface OperationTypeInfo {
    /** JSON schema describing request/response or goal/result/feedback types */
    schema: ServiceSchema | ActionSchema;
    /** Default values for the request/goal as YAML string */
    default_value?: string;
}

/**
 * Operation info from component discovery
 */
export interface Operation {
    /** Operation name (e.g., "calibrate") */
    name: string;
    /** Full ROS path (e.g., "/powertrain/engine/calibrate") */
    path: string;
    /** ROS interface type (e.g., "std_srvs/srv/Trigger") */
    type: string;
    /** Whether it's a service or action */
    kind: OperationKind;
    /** Type information including schema for request/response */
    type_info?: OperationTypeInfo;
}

/**
 * Request body for POST /components/{id}/operations/{op}
 */
export interface InvokeOperationRequest {
    /** Optional type override (auto-detected if not provided) */
    type?: string;
    /** Service request data (for services) */
    request?: unknown;
    /** Action goal data (for actions) */
    goal?: unknown;
}

// =============================================================================
// COMPONENT EXTENDED (with operations list from discovery)
// =============================================================================

/**
 * Extended component info including operations
 */
export interface ComponentWithOperations {
    id: string;
    namespace: string;
    fqn: string;
    type: string;
    area: string;
    /** List of available operations (services + actions) */
    operations?: Operation[];
}

// =============================================================================
// EXECUTIONS (SOVD-compliant Operations Model)
// =============================================================================

/**
 * Execution status values for SOVD operations
 */
export type ExecutionStatus = 'pending' | 'running' | 'succeeded' | 'failed' | 'canceled' | 'completed';

/**
 * Execution resource representing an operation invocation (SOVD-compliant)
 */
export interface Execution {
    /** Unique execution identifier */
    id: string;
    /** Current execution status */
    status: ExecutionStatus;
    /** ISO 8601 timestamp when execution was created */
    created_at: string;
    /** ISO 8601 timestamp when execution started running */
    started_at?: string;
    /** ISO 8601 timestamp when execution finished */
    finished_at?: string;
    /** Result data for completed executions */
    result?: unknown;
    /** Error message for failed executions */
    error?: string;
    /** Last feedback for action executions */
    last_feedback?: unknown;
}

/**
 * Request to create a new execution
 */
export interface CreateExecutionRequest {
    /** Optional type override (auto-detected if not provided) */
    type?: string;
    /** Input data for the operation (request for services, goal for actions) */
    input?: unknown;
}

/**
 * Response from POST /{entity}/operations/{op}/executions
 */
export interface CreateExecutionResponse {
    /** Execution ID for tracking (optional for service calls which complete immediately) */
    id?: string;
    /** Initial execution status */
    status: ExecutionStatus;
    /** Operation kind (service or action) */
    kind: OperationKind;
    /** Result data (for synchronous service calls) */
    result?: unknown;
    /** Parameters/output data (for service call responses) */
    parameters?: unknown;
    /** Error message if execution creation failed */
    error?: string;
}

/**
 * Response from GET /{entity}/operations/{op}/executions
 */
export interface ListExecutionsResponse {
    /** Array of executions */
    items: Execution[];
    /** Total count of executions */
    count: number;
}

// =============================================================================
// APPS (ROS 2 Nodes as SOVD Apps)
// =============================================================================

/**
 * App entity representing a ROS 2 node
 */
export interface App extends SovdEntity {
    /** ROS 2 node name */
    node_name: string;
    /** ROS 2 namespace */
    namespace: string;
    /** Fully qualified name (namespace + node_name) */
    fqn: string;
    /** Parent component ID */
    component_id?: string;
}

/**
 * App capabilities response
 */
export interface AppCapabilities {
    /** App identifier */
    id: string;
    /** FQN of the node */
    fqn: string;
    /** Available resource collections */
    resources: {
        data?: boolean;
        operations?: boolean;
        configurations?: boolean;
        faults?: boolean;
    };
    /** Links to related resources */
    links?: Record<string, string>;
}

// =============================================================================
// FUNCTIONS (Capability Groupings)
// =============================================================================

/**
 * SovdFunction entity representing a capability grouping
 * (Named SovdFunction to avoid shadowing JavaScript's global Function type)
 */
export interface SovdFunction extends SovdEntity {
    /** Description of the function */
    description?: string;
    /** IDs of apps that host this function (loaded from separate /hosts endpoint) */
    hosts?: string[];
}

/**
 * Function capabilities response
 */
export interface FunctionCapabilities {
    /** Function identifier */
    id: string;
    /** Function description */
    description?: string;
    /** Available resource collections */
    resources: {
        data?: boolean;
        operations?: boolean;
        hosts?: boolean;
    };
    /** Links to related resources */
    links?: Record<string, string>;
}

// =============================================================================
// FAULTS (SOVD Diagnostic Trouble Codes)
// =============================================================================

/**
 * Fault severity levels
 */
export type FaultSeverity = 'info' | 'warning' | 'error' | 'critical';

/**
 * Fault status values (legacy)
 */
export type FaultStatusValue = 'active' | 'pending' | 'cleared' | 'healed';

/**
 * Alias for backwards compatibility
 * @deprecated Use FaultStatusValue for clarity
 */
export type FaultStatus = FaultStatusValue;

// ==================== SOVD Snapshot Types ====================

/**
 * Base snapshot type - freeze frame or rosbag
 */
export interface SnapshotBase {
    type: 'freeze_frame' | 'rosbag';
    name: string;
}

/**
 * Freeze frame snapshot - captured topic data
 */
export interface FreezeFrameSnapshot extends SnapshotBase {
    type: 'freeze_frame';
    data: unknown;
    'x-medkit'?: {
        topic: string;
        message_type: string;
        full_data: unknown;
        captured_at: string;
        parse_error?: string;
    };
}

/**
 * Rosbag snapshot - recording file metadata
 */
export interface RosbagSnapshot extends SnapshotBase {
    type: 'rosbag';
    bulk_data_uri: string;
    size_bytes: number;
    duration_sec: number;
    format: 'mcap' | 'sqlite3' | 'db3';
    'x-medkit'?: {
        captured_at: string;
        fault_code: string;
    };
}

/**
 * Snapshot union type - discriminated by 'type' field
 */
export type Snapshot = FreezeFrameSnapshot | RosbagSnapshot;

// ==================== SOVD Environment Data ====================

/**
 * Extended data records with timestamps
 */
export interface ExtendedDataRecords {
    first_occurrence: string;
    last_occurrence: string;
}

/**
 * Environment data containing snapshots and record timestamps
 */
export interface EnvironmentData {
    extended_data_records: ExtendedDataRecords;
    snapshots: Snapshot[];
}

// ==================== SOVD Fault Status Object ====================

/**
 * SOVD-compliant fault status object
 */
export interface SovdFaultStatus {
    aggregatedStatus: 'active' | 'passive' | 'cleared';
    testFailed: '0' | '1';
    confirmedDTC: '0' | '1';
    pendingDTC: '0' | '1';
}

// ==================== SOVD Fault Item & Response ====================

/**
 * Fault item in SOVD response
 */
export interface FaultItem {
    code: string;
    fault_name: string;
    severity: number;
    status: SovdFaultStatus;
}

/**
 * Extension fields for fault response
 */
export interface FaultExtensions {
    occurrence_count: number;
    reporting_sources: string[];
    severity_label: string;
}

/**
 * SOVD-compliant fault response with environment data
 */
export interface FaultResponse {
    item: FaultItem;
    environment_data: EnvironmentData;
    'x-medkit'?: FaultExtensions;
}

// ==================== Snapshot Type Guards ====================

/**
 * Type guard for freeze_frame snapshot
 */
export function isFreezeFrameSnapshot(snapshot: Snapshot): snapshot is FreezeFrameSnapshot {
    return snapshot.type === 'freeze_frame';
}

/**
 * Type guard for rosbag snapshot
 */
export function isRosbagSnapshot(snapshot: Snapshot): snapshot is RosbagSnapshot {
    return snapshot.type === 'rosbag';
}

// ==================== Legacy Fault Types ====================

/**
 * Legacy fault entity (for backwards compatibility)
 */
export interface Fault {
    /** Unique fault code identifier */
    code: string;
    /** Human-readable fault message */
    message: string;
    /** Fault severity level */
    severity: FaultSeverity;
    /** Current fault status */
    status: FaultStatusValue;
    /** ISO 8601 timestamp when fault was detected */
    timestamp: string;
    /** Entity ID where fault originated */
    entity_id: string;
    /** Entity type (component, app, etc.) */
    entity_type: string;
    /** Additional fault parameters */
    parameters?: Record<string, unknown>;
    /** Whether snapshots are available for this fault */
    has_snapshots?: boolean;
}

/**
 * Response from GET /faults or GET /{entity}/faults
 */
export interface ListFaultsResponse {
    /** Array of faults */
    items: Fault[];
    /** Total count of faults */
    count: number;
}

/**
 * Legacy fault snapshot (deprecated - use Snapshot instead)
 * @deprecated Use FreezeFrameSnapshot or RosbagSnapshot instead
 */
export interface FaultSnapshot {
    /** Snapshot identifier */
    id: string;
    /** ISO 8601 timestamp when snapshot was captured */
    timestamp: string;
    /** Captured data at time of fault */
    data: Record<string, unknown>;
}

/**
 * Legacy response from GET /{entity}/faults/{code}/snapshots
 * @deprecated Use environment_data.snapshots from FaultResponse instead
 */
export interface ListSnapshotsResponse {
    /** Array of snapshots */
    items: FaultSnapshot[];
    /** Total count of snapshots */
    count: number;
}

// =============================================================================
// BULK DATA (SOVD Binary Data Downloads)
// =============================================================================

/**
 * Bulk data category listing
 */
export interface BulkDataCategory {
    items: string[];
}

/**
 * Bulk data descriptor for a single item
 */
export interface BulkDataDescriptor {
    /** UUID identifier */
    id: string;
    /** Display name */
    name: string;
    /** MIME type (e.g., 'application/x-mcap') */
    mimetype: string;
    /** File size in bytes */
    size: number;
    /** ISO 8601 creation timestamp */
    creation_date: string;
    /** Extension fields */
    'x-medkit'?: {
        fault_code: string;
        duration_sec: number;
        format: string;
    };
}

/**
 * Response from GET /{entity}/bulk-data/{category}
 */
export interface BulkDataList {
    items: BulkDataDescriptor[];
}

// =============================================================================
// SERVER CAPABILITIES (SOVD Discovery)
// =============================================================================

/**
 * Server capabilities from GET /
 */
export interface ServerCapabilities {
    /** SOVD specification version */
    sovd_version: string;
    /** Server implementation name */
    server_name?: string;
    /** Server implementation version */
    server_version?: string;
    /** Supported features */
    supported_features: string[];
    /** Entry points (resource collection URLs) */
    entry_points: Record<string, string>;
}

/**
 * Vendor info in SOVD version response
 */
export interface VendorInfo {
    /** Vendor/implementation name */
    name: string;
    /** Vendor/implementation version */
    version: string;
}

/**
 * Single SOVD info entry from version-info response
 */
export interface SovdInfoEntry {
    /** Base URI for the API */
    base_uri: string;
    /** SOVD specification version */
    version: string;
    /** Vendor-specific information */
    vendor_info?: VendorInfo;
}

/**
 * Version info from GET /version-info
 */
export interface VersionInfo {
    /** Array of SOVD version info entries */
    sovd_info: SovdInfoEntry[];
}

// =============================================================================
// AUTHENTICATION (Optional SOVD Auth)
// =============================================================================

/**
 * Authentication request for client_credentials grant
 */
export interface AuthRequest {
    /** Grant type (client_credentials) */
    grant_type: 'client_credentials';
    /** Client identifier */
    client_id: string;
    /** Client secret */
    client_secret: string;
}

/**
 * Authentication response with tokens
 */
export interface AuthResponse {
    /** JWT access token */
    access_token: string;
    /** Token type (Bearer) */
    token_type: 'Bearer';
    /** Access token expiry in seconds */
    expires_in: number;
    /** Refresh token for obtaining new access tokens */
    refresh_token?: string;
}

/**
 * Token refresh request
 */
export interface TokenRefreshRequest {
    /** Grant type for refresh */
    grant_type: 'refresh_token';
    /** Refresh token */
    refresh_token: string;
}

/**
 * Token revocation request
 */
export interface TokenRevokeRequest {
    /** Token to revoke */
    token: string;
    /** Token type hint */
    token_type_hint?: 'refresh_token' | 'access_token';
}

// =============================================================================
// GENERIC ERROR (SOVD Error Format)
// =============================================================================

/**
 * SOVD-compliant generic error response
 */
export interface SovdError {
    /** Error code identifier */
    error_code: string;
    /** Human-readable error message */
    message: string;
    /** Additional error parameters */
    parameters?: Record<string, unknown>;
}
