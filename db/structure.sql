SET statement_timeout = 0;
SET lock_timeout = 0;
SET idle_in_transaction_session_timeout = 0;
SET transaction_timeout = 0;
SET client_encoding = 'UTF8';
SET standard_conforming_strings = on;
SELECT pg_catalog.set_config('search_path', '', false);
SET check_function_bodies = false;
SET xmloption = content;
SET client_min_messages = warning;
SET row_security = off;

--
-- Name: learning_routes_engine_check_route_preview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_routes_engine_check_route_preview() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
DECLARE
  checked_route_id uuid;
  preview_count integer;
BEGIN
  IF TG_TABLE_NAME = 'learning_routes_engine_learning_routes' THEN
    checked_route_id := COALESCE(NEW.id, OLD.id);
  ELSE
    checked_route_id := COALESCE(NEW.learning_route_id, OLD.learning_route_id);
  END IF;

  IF NOT EXISTS (
    SELECT 1 FROM learning_routes_engine_learning_routes WHERE id = checked_route_id
  ) THEN
    RETURN NULL;
  END IF;

  SELECT COUNT(*) INTO preview_count
  FROM learning_routes_engine_route_modules
  WHERE learning_route_id = checked_route_id AND access_state = 0 AND position = 1;

  IF preview_count <> 1 THEN
    RAISE EXCEPTION 'learning route % must have exactly one permanent preview module at position 1', checked_route_id
      USING ERRCODE = '23514';
  END IF;

  RETURN NULL;
END;
$$;


--
-- Name: learning_routes_engine_preserve_preview(); Type: FUNCTION; Schema: public; Owner: -
--

CREATE FUNCTION public.learning_routes_engine_preserve_preview() RETURNS trigger
    LANGUAGE plpgsql
    AS $$
BEGIN
  IF OLD.access_state = 0 AND (
    TG_OP = 'DELETE' OR NEW.access_state <> 0 OR
    NEW.learning_route_id <> OLD.learning_route_id OR NEW.position <> 1
  ) AND EXISTS (
    SELECT 1 FROM learning_routes_engine_learning_routes WHERE id = OLD.learning_route_id
  ) THEN
    RAISE EXCEPTION 'the permanent preview module cannot be removed or reassigned'
      USING ERRCODE = '23514';
  END IF;

  RETURN COALESCE(NEW, OLD);
END;
$$;


SET default_tablespace = '';

SET default_table_access_method = heap;

--
-- Name: active_storage_attachments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_attachments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blob_id uuid NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    name character varying NOT NULL,
    record_id uuid NOT NULL,
    record_type character varying NOT NULL
);


--
-- Name: active_storage_blobs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_blobs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    byte_size bigint NOT NULL,
    checksum character varying,
    content_type character varying,
    created_at timestamp(6) without time zone NOT NULL,
    filename character varying NOT NULL,
    key character varying NOT NULL,
    metadata text,
    service_name character varying NOT NULL
);


--
-- Name: active_storage_variant_records; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.active_storage_variant_records (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    blob_id uuid NOT NULL,
    variation_digest character varying NOT NULL
);


--
-- Name: ai_orchestrator_ai_interactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_orchestrator_ai_interactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cache_key character varying,
    cached boolean DEFAULT false NOT NULL,
    cost_cents integer DEFAULT 0,
    cost_microcents bigint DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    error_message text,
    input_tokens integer DEFAULT 0,
    latency_ms integer,
    metadata jsonb DEFAULT '{}'::jsonb,
    model character varying NOT NULL,
    output_tokens integer DEFAULT 0,
    pricing_status character varying DEFAULT 'unpriced'::character varying NOT NULL,
    pricing_version character varying,
    prompt text NOT NULL,
    provider_rate_microcents bigint,
    provider_units bigint,
    response text,
    status integer DEFAULT 0 NOT NULL,
    task_type character varying,
    tokens_used integer DEFAULT 0,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid
);


--
-- Name: ai_orchestrator_ai_model_configs; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ai_orchestrator_ai_model_configs (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    enabled boolean DEFAULT true NOT NULL,
    fallback_model character varying,
    model_name character varying NOT NULL,
    priority integer DEFAULT 0 NOT NULL,
    rate_limit integer,
    settings jsonb DEFAULT '{}'::jsonb,
    task_type character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: analytics_learning_metrics; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_learning_metrics (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    metric_type character varying NOT NULL,
    recorded_date date NOT NULL,
    subject character varying,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL,
    value numeric(10,4)
);


--
-- Name: analytics_progress_snapshots; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_progress_snapshots (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    completion_percentage numeric(5,2) DEFAULT 0.0,
    created_at timestamp(6) without time zone NOT NULL,
    current_level integer DEFAULT 0,
    learning_route_id uuid NOT NULL,
    scores jsonb DEFAULT '{}'::jsonb,
    snapshot_date date NOT NULL,
    steps_completed integer DEFAULT 0,
    total_steps integer DEFAULT 0,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: analytics_study_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.analytics_study_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    activity_log jsonb DEFAULT '[]'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    duration_minutes integer DEFAULT 0,
    ended_at timestamp(6) without time zone,
    learning_route_id uuid,
    route_step_id uuid,
    started_at timestamp(6) without time zone NOT NULL,
    steps_completed integer DEFAULT 0,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: ar_internal_metadata; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.ar_internal_metadata (
    key character varying NOT NULL,
    value character varying,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: assessments_assessment_results; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments_assessment_results (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    feedback jsonb DEFAULT '{}'::jsonb,
    knowledge_gaps_identified jsonb DEFAULT '[]'::jsonb,
    passed boolean DEFAULT false NOT NULL,
    score numeric(5,2),
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: assessments_assessments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments_assessments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_type integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    passing_score numeric(5,2) DEFAULT 70.0,
    questions jsonb DEFAULT '[]'::jsonb,
    route_step_id uuid NOT NULL,
    time_limit_minutes integer,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: assessments_questions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments_questions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_id uuid NOT NULL,
    bloom_level integer DEFAULT 1,
    body text NOT NULL,
    correct_answer text,
    created_at timestamp(6) without time zone NOT NULL,
    difficulty integer DEFAULT 1,
    explanation text,
    options jsonb DEFAULT '[]'::jsonb,
    question_type integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: assessments_user_answers; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments_user_answers (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    answer text,
    correct boolean,
    created_at timestamp(6) without time zone NOT NULL,
    feedback text,
    question_id uuid NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: assessments_voice_responses; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.assessments_voice_responses (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_evaluation jsonb DEFAULT '{}'::jsonb,
    assessment_result_id uuid,
    audio_blob_key character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    route_step_id uuid NOT NULL,
    score integer,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    transcription text,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_activities; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_activities (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    trackable_id uuid NOT NULL,
    trackable_type character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_comments; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_comments (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    body text NOT NULL,
    commentable_id uuid NOT NULL,
    commentable_type character varying NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    edited_at timestamp(6) without time zone,
    likes_count integer DEFAULT 0 NOT NULL,
    parent_id uuid,
    replies_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_follows; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_follows (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    followed_id uuid NOT NULL,
    follower_id uuid NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: community_engine_likes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_likes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    likeable_id uuid NOT NULL,
    likeable_type character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_notifications; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_notifications (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    actor_id uuid NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    notifiable_id uuid NOT NULL,
    notifiable_type character varying NOT NULL,
    notification_type character varying NOT NULL,
    read_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_posts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_posts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    body text NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_ratings; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_ratings (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    score integer NOT NULL,
    shared_route_id uuid NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: community_engine_shared_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.community_engine_shared_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cloned_from_id uuid,
    clones_count integer DEFAULT 0 NOT NULL,
    comments_count integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    description text,
    learning_route_id uuid NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    ratings_count integer DEFAULT 0 NOT NULL,
    ratings_sum integer DEFAULT 0 NOT NULL,
    share_token character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL,
    visibility character varying DEFAULT 'public'::character varying NOT NULL
);


--
-- Name: content_engine_ai_contents; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_engine_ai_contents (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_model character varying,
    audio_duration double precision,
    audio_error_message text,
    audio_status character varying DEFAULT 'pending'::character varying NOT NULL,
    audio_transcript text,
    audio_url character varying,
    body text,
    cached boolean DEFAULT false NOT NULL,
    content_type integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    generation_cost numeric(10,4) DEFAULT 0.0,
    image_url character varying,
    metadata jsonb DEFAULT '{}'::jsonb,
    route_step_id uuid NOT NULL,
    tokens_used integer DEFAULT 0,
    updated_at timestamp(6) without time zone NOT NULL,
    voice_id character varying
);


--
-- Name: content_engine_content_caches; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_engine_content_caches (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    cache_key character varying NOT NULL,
    content text NOT NULL,
    content_type character varying,
    created_at timestamp(6) without time zone NOT NULL,
    expires_at timestamp(6) without time zone,
    metadata jsonb DEFAULT '{}'::jsonb,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: content_engine_user_notes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.content_engine_user_notes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    body text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    route_step_id uuid NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: core_sessions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.core_sessions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    ip_address character varying,
    last_active_at timestamp(6) without time zone,
    updated_at timestamp(6) without time zone NOT NULL,
    user_agent character varying,
    user_id uuid NOT NULL
);


--
-- Name: core_users; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.core_users (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    avatar_url character varying,
    created_at timestamp(6) without time zone NOT NULL,
    email character varying NOT NULL,
    email_verified_at timestamp(6) without time zone,
    followers_count integer DEFAULT 0 NOT NULL,
    following_count integer DEFAULT 0 NOT NULL,
    locale character varying DEFAULT 'en'::character varying NOT NULL,
    name character varying NOT NULL,
    onboarding_completed boolean DEFAULT false NOT NULL,
    password_digest character varying NOT NULL,
    provider character varying,
    remember_token character varying,
    role integer DEFAULT 0 NOT NULL,
    theme character varying DEFAULT 'system'::character varying NOT NULL,
    timezone character varying DEFAULT 'UTC'::character varying NOT NULL,
    uid character varying,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: learning_routes_engine_block_attempts; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_block_attempts (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    attempts integer DEFAULT 0 NOT NULL,
    block_type character varying NOT NULL,
    completed_at timestamp(6) without time zone,
    correct boolean,
    created_at timestamp(6) without time zone NOT NULL,
    payload jsonb DEFAULT '{}'::jsonb NOT NULL,
    released_at timestamp(6) without time zone,
    route_step_id uuid NOT NULL,
    score numeric(5,2),
    section_index integer NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: learning_routes_engine_knowledge_gaps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_knowledge_gaps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_result_id uuid,
    created_at timestamp(6) without time zone NOT NULL,
    description text,
    identified_from character varying,
    learning_route_id uuid NOT NULL,
    resolved boolean DEFAULT false NOT NULL,
    severity integer DEFAULT 0 NOT NULL,
    topic character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: learning_routes_engine_learning_profiles; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_learning_profiles (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    assessment_data jsonb DEFAULT '{}'::jsonb,
    created_at timestamp(6) without time zone NOT NULL,
    current_level character varying DEFAULT 'beginner'::character varying NOT NULL,
    goal character varying,
    interests jsonb DEFAULT '[]'::jsonb,
    learning_style jsonb DEFAULT '[]'::jsonb,
    preferred_goals jsonb DEFAULT '[]'::jsonb,
    preferred_pace character varying,
    saved_style_answers jsonb DEFAULT '{}'::jsonb,
    saved_style_result jsonb DEFAULT '{}'::jsonb,
    session_minutes integer,
    timeline character varying,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL,
    weekly_hours integer
);


--
-- Name: learning_routes_engine_learning_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_learning_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    ai_interaction_id uuid,
    ai_model_used character varying,
    comments_count integer DEFAULT 0 NOT NULL,
    content_preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    current_step integer DEFAULT 0,
    difficulty_progression jsonb DEFAULT '{}'::jsonb,
    generated_at timestamp(6) without time zone,
    generation_params jsonb DEFAULT '{}'::jsonb,
    generation_status character varying,
    learning_profile_id uuid NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    locale character varying DEFAULT 'en'::character varying NOT NULL,
    status integer DEFAULT 0 NOT NULL,
    subject_area character varying,
    target_locale character varying,
    topic character varying NOT NULL,
    total_steps integer DEFAULT 0,
    translations jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: learning_routes_engine_reinforcement_routes; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_reinforcement_routes (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    knowledge_gap_id uuid NOT NULL,
    learning_route_id uuid NOT NULL,
    status integer DEFAULT 0 NOT NULL,
    steps jsonb DEFAULT '[]'::jsonb,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: learning_routes_engine_route_modules; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_route_modules (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    learning_route_id uuid NOT NULL,
    "position" integer NOT NULL,
    title character varying NOT NULL,
    description text,
    translations jsonb DEFAULT '{}'::jsonb NOT NULL,
    access_state integer DEFAULT 1 NOT NULL,
    generation_state integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    CONSTRAINT route_modules_access_state CHECK ((access_state = ANY (ARRAY[0, 1, 2]))),
    CONSTRAINT route_modules_generation_state CHECK ((generation_state = ANY (ARRAY[0, 1, 2, 3]))),
    CONSTRAINT route_modules_positive_position CHECK (("position" > 0)),
    CONSTRAINT route_modules_preview_first CHECK (((access_state <> 0) OR ("position" = 1)))
);


--
-- Name: learning_routes_engine_route_steps; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_route_steps (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    bloom_level integer,
    comments_count integer DEFAULT 0 NOT NULL,
    completed_at timestamp(6) without time zone,
    content_type integer DEFAULT 0 NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    delivery_format character varying DEFAULT 'mixed'::character varying,
    description text,
    estimated_minutes integer,
    fsrs_difficulty double precision DEFAULT 0.0,
    fsrs_elapsed_days double precision DEFAULT 0.0,
    fsrs_lapses integer DEFAULT 0,
    fsrs_last_review_at timestamp(6) without time zone,
    fsrs_next_review_at timestamp(6) without time zone,
    fsrs_reps integer DEFAULT 0,
    fsrs_scheduled_days double precision DEFAULT 0.0,
    fsrs_stability double precision DEFAULT 0.0,
    fsrs_state integer DEFAULT 0,
    learning_route_id uuid NOT NULL,
    level integer DEFAULT 0 NOT NULL,
    likes_count integer DEFAULT 0 NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    "position" integer NOT NULL,
    prerequisites jsonb DEFAULT '[]'::jsonb,
    status integer DEFAULT 0 NOT NULL,
    title character varying NOT NULL,
    translations jsonb DEFAULT '{}'::jsonb NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL
);


--
-- Name: learning_routes_engine_tutor_messages; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.learning_routes_engine_tutor_messages (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    content text NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    role character varying DEFAULT 'user'::character varying NOT NULL,
    step_id uuid NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: owner_audit_events; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.owner_audit_events (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    action character varying NOT NULL,
    actor_user_id uuid,
    created_at timestamp(6) without time zone NOT NULL,
    ip_digest character varying,
    metadata jsonb DEFAULT '{}'::jsonb NOT NULL,
    request_id character varying,
    subject_user_id uuid,
    updated_at timestamp(6) without time zone NOT NULL,
    user_agent_digest character varying
);


--
-- Name: playing_with_neon; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.playing_with_neon (
    id integer NOT NULL,
    name text NOT NULL,
    value real
);


--
-- Name: playing_with_neon_id_seq; Type: SEQUENCE; Schema: public; Owner: -
--

CREATE SEQUENCE public.playing_with_neon_id_seq
    AS integer
    START WITH 1
    INCREMENT BY 1
    NO MINVALUE
    NO MAXVALUE
    CACHE 1;


--
-- Name: playing_with_neon_id_seq; Type: SEQUENCE OWNED BY; Schema: public; Owner: -
--

ALTER SEQUENCE public.playing_with_neon_id_seq OWNED BY public.playing_with_neon.id;


--
-- Name: route_requests; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.route_requests (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    custom_topic character varying,
    error_message text,
    goals jsonb DEFAULT '[]'::jsonb NOT NULL,
    learning_route_id uuid,
    learning_style_answers jsonb DEFAULT '{}'::jsonb NOT NULL,
    learning_style_result jsonb DEFAULT '{}'::jsonb NOT NULL,
    level character varying NOT NULL,
    pace character varying NOT NULL,
    route_locale character varying DEFAULT 'es'::character varying NOT NULL,
    session_minutes integer,
    status character varying DEFAULT 'pending'::character varying NOT NULL,
    topics jsonb DEFAULT '[]'::jsonb NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL,
    weekly_hours integer
);


--
-- Name: schema_migrations; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.schema_migrations (
    version character varying NOT NULL
);


--
-- Name: user_engagements; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.user_engagements (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    current_league character varying DEFAULT 'bronze'::character varying,
    current_level integer DEFAULT 1 NOT NULL,
    current_streak integer DEFAULT 0 NOT NULL,
    last_activity_date date,
    longest_streak integer DEFAULT 0 NOT NULL,
    preferences jsonb DEFAULT '{}'::jsonb NOT NULL,
    streak_freeze_used_today boolean DEFAULT false,
    streak_freezes_available integer DEFAULT 1 NOT NULL,
    total_xp integer DEFAULT 0 NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL,
    weekly_xp jsonb DEFAULT '{}'::jsonb NOT NULL,
    xp_to_next_level integer DEFAULT 100 NOT NULL
);


--
-- Name: xp_transactions; Type: TABLE; Schema: public; Owner: -
--

CREATE TABLE public.xp_transactions (
    id uuid DEFAULT gen_random_uuid() NOT NULL,
    amount integer NOT NULL,
    created_at timestamp(6) without time zone NOT NULL,
    metadata jsonb DEFAULT '{}'::jsonb,
    source_id character varying,
    source_type character varying NOT NULL,
    updated_at timestamp(6) without time zone NOT NULL,
    user_id uuid NOT NULL
);


--
-- Name: playing_with_neon id; Type: DEFAULT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playing_with_neon ALTER COLUMN id SET DEFAULT nextval('public.playing_with_neon_id_seq'::regclass);


--
-- Name: active_storage_attachments active_storage_attachments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_attachments
    ADD CONSTRAINT active_storage_attachments_pkey PRIMARY KEY (id);


--
-- Name: active_storage_blobs active_storage_blobs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_blobs
    ADD CONSTRAINT active_storage_blobs_pkey PRIMARY KEY (id);


--
-- Name: active_storage_variant_records active_storage_variant_records_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_variant_records
    ADD CONSTRAINT active_storage_variant_records_pkey PRIMARY KEY (id);


--
-- Name: ai_orchestrator_ai_interactions ai_orchestrator_ai_interactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_orchestrator_ai_interactions
    ADD CONSTRAINT ai_orchestrator_ai_interactions_pkey PRIMARY KEY (id);


--
-- Name: ai_orchestrator_ai_model_configs ai_orchestrator_ai_model_configs_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_orchestrator_ai_model_configs
    ADD CONSTRAINT ai_orchestrator_ai_model_configs_pkey PRIMARY KEY (id);


--
-- Name: analytics_learning_metrics analytics_learning_metrics_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_learning_metrics
    ADD CONSTRAINT analytics_learning_metrics_pkey PRIMARY KEY (id);


--
-- Name: analytics_progress_snapshots analytics_progress_snapshots_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_progress_snapshots
    ADD CONSTRAINT analytics_progress_snapshots_pkey PRIMARY KEY (id);


--
-- Name: analytics_study_sessions analytics_study_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_study_sessions
    ADD CONSTRAINT analytics_study_sessions_pkey PRIMARY KEY (id);


--
-- Name: ar_internal_metadata ar_internal_metadata_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ar_internal_metadata
    ADD CONSTRAINT ar_internal_metadata_pkey PRIMARY KEY (key);


--
-- Name: assessments_assessment_results assessments_assessment_results_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_assessment_results
    ADD CONSTRAINT assessments_assessment_results_pkey PRIMARY KEY (id);


--
-- Name: assessments_assessments assessments_assessments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_assessments
    ADD CONSTRAINT assessments_assessments_pkey PRIMARY KEY (id);


--
-- Name: assessments_questions assessments_questions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_questions
    ADD CONSTRAINT assessments_questions_pkey PRIMARY KEY (id);


--
-- Name: assessments_user_answers assessments_user_answers_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_user_answers
    ADD CONSTRAINT assessments_user_answers_pkey PRIMARY KEY (id);


--
-- Name: assessments_voice_responses assessments_voice_responses_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_voice_responses
    ADD CONSTRAINT assessments_voice_responses_pkey PRIMARY KEY (id);


--
-- Name: community_engine_activities community_engine_activities_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_activities
    ADD CONSTRAINT community_engine_activities_pkey PRIMARY KEY (id);


--
-- Name: community_engine_comments community_engine_comments_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_comments
    ADD CONSTRAINT community_engine_comments_pkey PRIMARY KEY (id);


--
-- Name: community_engine_follows community_engine_follows_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_follows
    ADD CONSTRAINT community_engine_follows_pkey PRIMARY KEY (id);


--
-- Name: community_engine_likes community_engine_likes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_likes
    ADD CONSTRAINT community_engine_likes_pkey PRIMARY KEY (id);


--
-- Name: community_engine_notifications community_engine_notifications_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_notifications
    ADD CONSTRAINT community_engine_notifications_pkey PRIMARY KEY (id);


--
-- Name: community_engine_posts community_engine_posts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_posts
    ADD CONSTRAINT community_engine_posts_pkey PRIMARY KEY (id);


--
-- Name: community_engine_ratings community_engine_ratings_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_ratings
    ADD CONSTRAINT community_engine_ratings_pkey PRIMARY KEY (id);


--
-- Name: community_engine_shared_routes community_engine_shared_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_shared_routes
    ADD CONSTRAINT community_engine_shared_routes_pkey PRIMARY KEY (id);


--
-- Name: content_engine_ai_contents content_engine_ai_contents_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_ai_contents
    ADD CONSTRAINT content_engine_ai_contents_pkey PRIMARY KEY (id);


--
-- Name: content_engine_content_caches content_engine_content_caches_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_content_caches
    ADD CONSTRAINT content_engine_content_caches_pkey PRIMARY KEY (id);


--
-- Name: content_engine_user_notes content_engine_user_notes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_user_notes
    ADD CONSTRAINT content_engine_user_notes_pkey PRIMARY KEY (id);


--
-- Name: core_sessions core_sessions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_sessions
    ADD CONSTRAINT core_sessions_pkey PRIMARY KEY (id);


--
-- Name: core_users core_users_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_users
    ADD CONSTRAINT core_users_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_block_attempts learning_routes_engine_block_attempts_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_block_attempts
    ADD CONSTRAINT learning_routes_engine_block_attempts_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_knowledge_gaps learning_routes_engine_knowledge_gaps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_knowledge_gaps
    ADD CONSTRAINT learning_routes_engine_knowledge_gaps_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_learning_profiles learning_routes_engine_learning_profiles_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_learning_profiles
    ADD CONSTRAINT learning_routes_engine_learning_profiles_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_learning_routes learning_routes_engine_learning_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_learning_routes
    ADD CONSTRAINT learning_routes_engine_learning_routes_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_reinforcement_routes learning_routes_engine_reinforcement_routes_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_reinforcement_routes
    ADD CONSTRAINT learning_routes_engine_reinforcement_routes_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_route_modules learning_routes_engine_route_modules_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_route_modules
    ADD CONSTRAINT learning_routes_engine_route_modules_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_route_steps learning_routes_engine_route_steps_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_route_steps
    ADD CONSTRAINT learning_routes_engine_route_steps_pkey PRIMARY KEY (id);


--
-- Name: learning_routes_engine_tutor_messages learning_routes_engine_tutor_messages_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_tutor_messages
    ADD CONSTRAINT learning_routes_engine_tutor_messages_pkey PRIMARY KEY (id);


--
-- Name: owner_audit_events owner_audit_events_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_audit_events
    ADD CONSTRAINT owner_audit_events_pkey PRIMARY KEY (id);


--
-- Name: playing_with_neon playing_with_neon_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.playing_with_neon
    ADD CONSTRAINT playing_with_neon_pkey PRIMARY KEY (id);


--
-- Name: route_requests route_requests_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_requests
    ADD CONSTRAINT route_requests_pkey PRIMARY KEY (id);


--
-- Name: schema_migrations schema_migrations_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.schema_migrations
    ADD CONSTRAINT schema_migrations_pkey PRIMARY KEY (version);


--
-- Name: user_engagements user_engagements_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_engagements
    ADD CONSTRAINT user_engagements_pkey PRIMARY KEY (id);


--
-- Name: xp_transactions xp_transactions_pkey; Type: CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT xp_transactions_pkey PRIMARY KEY (id);


--
-- Name: idx_activities_on_trackable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_on_trackable ON public.community_engine_activities USING btree (trackable_type, trackable_id);


--
-- Name: idx_activities_user_action_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_user_action_timeline ON public.community_engine_activities USING btree (user_id, action, created_at);


--
-- Name: idx_activities_user_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_activities_user_timeline ON public.community_engine_activities USING btree (user_id, created_at);


--
-- Name: idx_ai_interactions_usage_billing; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_interactions_usage_billing ON public.ai_orchestrator_ai_interactions USING btree (user_id, created_at, cost_microcents);


--
-- Name: idx_ai_interactions_user_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_ai_interactions_user_date ON public.ai_orchestrator_ai_interactions USING btree (user_id, created_at);


--
-- Name: idx_assessment_results_user_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_assessment_results_user_timeline ON public.assessments_assessment_results USING btree (user_id, created_at);


--
-- Name: idx_block_attempts_on_route_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_attempts_on_route_step ON public.learning_routes_engine_block_attempts USING btree (route_step_id);


--
-- Name: idx_block_attempts_released; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_attempts_released ON public.learning_routes_engine_block_attempts USING btree (released_at) WHERE (released_at IS NOT NULL);


--
-- Name: idx_block_attempts_unique_per_section; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_block_attempts_unique_per_section ON public.learning_routes_engine_block_attempts USING btree (user_id, route_step_id, section_index);


--
-- Name: idx_block_attempts_user_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_block_attempts_user_timeline ON public.learning_routes_engine_block_attempts USING btree (user_id, completed_at);


--
-- Name: idx_ce_ratings_user_shared_route; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_ce_ratings_user_shared_route ON public.community_engine_ratings USING btree (user_id, shared_route_id);


--
-- Name: idx_comments_commentable_timeline; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_commentable_timeline ON public.community_engine_comments USING btree (commentable_type, commentable_id, created_at);


--
-- Name: idx_comments_on_commentable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_comments_on_commentable ON public.community_engine_comments USING btree (commentable_type, commentable_id);


--
-- Name: idx_core_users_single_owner; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_core_users_single_owner ON public.core_users USING btree (role) WHERE (role = 2);


--
-- Name: idx_follows_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_follows_unique ON public.community_engine_follows USING btree (follower_id, followed_id);


--
-- Name: idx_knowledge_gaps_on_route_and_result; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_knowledge_gaps_on_route_and_result ON public.learning_routes_engine_knowledge_gaps USING btree (learning_route_id, assessment_result_id);


--
-- Name: idx_learning_metrics_user_type_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_metrics_user_type_date ON public.analytics_learning_metrics USING btree (user_id, metric_type, recorded_date);


--
-- Name: idx_learning_routes_on_ai_interaction; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_routes_on_ai_interaction ON public.learning_routes_engine_learning_routes USING btree (ai_interaction_id);


--
-- Name: idx_learning_routes_on_generation_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_routes_on_generation_status ON public.learning_routes_engine_learning_routes USING btree (generation_status);


--
-- Name: idx_learning_routes_on_profile_and_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_learning_routes_on_profile_and_status ON public.learning_routes_engine_learning_routes USING btree (learning_profile_id, status);


--
-- Name: idx_likes_on_likeable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_likes_on_likeable ON public.community_engine_likes USING btree (likeable_type, likeable_id);


--
-- Name: idx_likes_unique_per_user; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_likes_unique_per_user ON public.community_engine_likes USING btree (user_id, likeable_type, likeable_id);


--
-- Name: idx_model_configs_on_task_and_priority; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_model_configs_on_task_and_priority ON public.ai_orchestrator_ai_model_configs USING btree (task_type, priority);


--
-- Name: idx_notifications_on_notifiable; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_on_notifiable ON public.community_engine_notifications USING btree (notifiable_type, notifiable_id);


--
-- Name: idx_notifications_user_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_type ON public.community_engine_notifications USING btree (user_id, notification_type);


--
-- Name: idx_notifications_user_unread; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_notifications_user_unread ON public.community_engine_notifications USING btree (user_id, read_at, created_at);


--
-- Name: idx_on_current_level_1784842c74; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_current_level_1784842c74 ON public.learning_routes_engine_learning_profiles USING btree (current_level);


--
-- Name: idx_on_knowledge_gap_id_b5983a11b7; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_knowledge_gap_id_b5983a11b7 ON public.learning_routes_engine_reinforcement_routes USING btree (knowledge_gap_id);


--
-- Name: idx_on_learning_profile_id_5e77d3d179; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_learning_profile_id_5e77d3d179 ON public.learning_routes_engine_learning_routes USING btree (learning_profile_id);


--
-- Name: idx_on_learning_route_id_8445f8b9bc; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_learning_route_id_8445f8b9bc ON public.learning_routes_engine_reinforcement_routes USING btree (learning_route_id);


--
-- Name: idx_on_learning_route_id_995e696068; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_learning_route_id_995e696068 ON public.learning_routes_engine_knowledge_gaps USING btree (learning_route_id);


--
-- Name: idx_on_user_id_step_id_4321622576; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_on_user_id_step_id_4321622576 ON public.learning_routes_engine_tutor_messages USING btree (user_id, step_id);


--
-- Name: idx_progress_snapshots_unique; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_progress_snapshots_unique ON public.analytics_progress_snapshots USING btree (user_id, learning_route_id, snapshot_date);


--
-- Name: idx_results_on_user_and_assessment; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_results_on_user_and_assessment ON public.assessments_assessment_results USING btree (user_id, assessment_id);


--
-- Name: idx_route_modules_route_position; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_route_modules_route_position ON public.learning_routes_engine_route_modules USING btree (learning_route_id, "position");


--
-- Name: idx_route_modules_route_states; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_modules_route_states ON public.learning_routes_engine_route_modules USING btree (learning_route_id, access_state, generation_state);


--
-- Name: idx_route_modules_single_preview; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_route_modules_single_preview ON public.learning_routes_engine_route_modules USING btree (learning_route_id) WHERE (access_state = 0);


--
-- Name: idx_route_steps_on_fsrs_next_review; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_steps_on_fsrs_next_review ON public.learning_routes_engine_route_steps USING btree (fsrs_next_review_at);


--
-- Name: idx_route_steps_on_fsrs_state; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_steps_on_fsrs_state ON public.learning_routes_engine_route_steps USING btree (fsrs_state);


--
-- Name: idx_route_steps_on_route_and_position; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_route_steps_on_route_and_position ON public.learning_routes_engine_route_steps USING btree (learning_route_id, "position");


--
-- Name: idx_route_steps_on_route_and_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_route_steps_on_route_and_status ON public.learning_routes_engine_route_steps USING btree (learning_route_id, status);


--
-- Name: idx_shared_routes_public_feed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_shared_routes_public_feed ON public.community_engine_shared_routes USING btree (visibility, created_at);


--
-- Name: idx_study_sessions_user_step_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_study_sessions_user_step_active ON public.analytics_study_sessions USING btree (user_id, route_step_id, ended_at);


--
-- Name: idx_user_answers_on_user_and_question; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX idx_user_answers_on_user_and_question ON public.assessments_user_answers USING btree (user_id, question_id);


--
-- Name: idx_user_engagements_streak_freeze_active; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_engagements_streak_freeze_active ON public.user_engagements USING btree (streak_freeze_used_today) WHERE (streak_freeze_used_today = true);


--
-- Name: idx_user_notes_on_user_and_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_user_notes_on_user_and_step ON public.content_engine_user_notes USING btree (user_id, route_step_id);


--
-- Name: idx_voice_responses_user_step; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX idx_voice_responses_user_step ON public.assessments_voice_responses USING btree (user_id, route_step_id);


--
-- Name: index_active_storage_attachments_on_blob_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_active_storage_attachments_on_blob_id ON public.active_storage_attachments USING btree (blob_id);


--
-- Name: index_active_storage_attachments_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_attachments_uniqueness ON public.active_storage_attachments USING btree (record_type, record_id, name, blob_id);


--
-- Name: index_active_storage_blobs_on_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_blobs_on_key ON public.active_storage_blobs USING btree (key);


--
-- Name: index_active_storage_variant_records_uniqueness; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_active_storage_variant_records_uniqueness ON public.active_storage_variant_records USING btree (blob_id, variation_digest);


--
-- Name: index_ai_orchestrator_ai_interactions_on_cache_key; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_cache_key ON public.ai_orchestrator_ai_interactions USING btree (cache_key);


--
-- Name: index_ai_orchestrator_ai_interactions_on_cached; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_cached ON public.ai_orchestrator_ai_interactions USING btree (cached);


--
-- Name: index_ai_orchestrator_ai_interactions_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_created_at ON public.ai_orchestrator_ai_interactions USING btree (created_at);


--
-- Name: index_ai_orchestrator_ai_interactions_on_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_model ON public.ai_orchestrator_ai_interactions USING btree (model);


--
-- Name: index_ai_orchestrator_ai_interactions_on_pricing_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_pricing_status ON public.ai_orchestrator_ai_interactions USING btree (pricing_status);


--
-- Name: index_ai_orchestrator_ai_interactions_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_status ON public.ai_orchestrator_ai_interactions USING btree (status);


--
-- Name: index_ai_orchestrator_ai_interactions_on_task_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_task_type ON public.ai_orchestrator_ai_interactions USING btree (task_type);


--
-- Name: index_ai_orchestrator_ai_interactions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_interactions_on_user_id ON public.ai_orchestrator_ai_interactions USING btree (user_id);


--
-- Name: index_ai_orchestrator_ai_model_configs_on_enabled; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_model_configs_on_enabled ON public.ai_orchestrator_ai_model_configs USING btree (enabled);


--
-- Name: index_ai_orchestrator_ai_model_configs_on_model_name; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_ai_orchestrator_ai_model_configs_on_model_name ON public.ai_orchestrator_ai_model_configs USING btree (model_name);


--
-- Name: index_analytics_learning_metrics_on_metric_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_learning_metrics_on_metric_type ON public.analytics_learning_metrics USING btree (metric_type);


--
-- Name: index_analytics_learning_metrics_on_recorded_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_learning_metrics_on_recorded_date ON public.analytics_learning_metrics USING btree (recorded_date);


--
-- Name: index_analytics_learning_metrics_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_learning_metrics_on_user_id ON public.analytics_learning_metrics USING btree (user_id);


--
-- Name: index_analytics_progress_snapshots_on_learning_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_progress_snapshots_on_learning_route_id ON public.analytics_progress_snapshots USING btree (learning_route_id);


--
-- Name: index_analytics_progress_snapshots_on_snapshot_date; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_progress_snapshots_on_snapshot_date ON public.analytics_progress_snapshots USING btree (snapshot_date);


--
-- Name: index_analytics_progress_snapshots_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_progress_snapshots_on_user_id ON public.analytics_progress_snapshots USING btree (user_id);


--
-- Name: index_analytics_study_sessions_on_learning_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_study_sessions_on_learning_route_id ON public.analytics_study_sessions USING btree (learning_route_id);


--
-- Name: index_analytics_study_sessions_on_route_step_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_study_sessions_on_route_step_id ON public.analytics_study_sessions USING btree (route_step_id);


--
-- Name: index_analytics_study_sessions_on_started_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_study_sessions_on_started_at ON public.analytics_study_sessions USING btree (started_at);


--
-- Name: index_analytics_study_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_analytics_study_sessions_on_user_id ON public.analytics_study_sessions USING btree (user_id);


--
-- Name: index_assessments_assessment_results_on_assessment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_assessment_results_on_assessment_id ON public.assessments_assessment_results USING btree (assessment_id);


--
-- Name: index_assessments_assessment_results_on_passed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_assessment_results_on_passed ON public.assessments_assessment_results USING btree (passed);


--
-- Name: index_assessments_assessment_results_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_assessment_results_on_user_id ON public.assessments_assessment_results USING btree (user_id);


--
-- Name: index_assessments_assessments_on_assessment_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_assessments_on_assessment_type ON public.assessments_assessments USING btree (assessment_type);


--
-- Name: index_assessments_assessments_on_route_step_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_assessments_on_route_step_id ON public.assessments_assessments USING btree (route_step_id);


--
-- Name: index_assessments_questions_on_assessment_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_questions_on_assessment_id ON public.assessments_questions USING btree (assessment_id);


--
-- Name: index_assessments_questions_on_bloom_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_questions_on_bloom_level ON public.assessments_questions USING btree (bloom_level);


--
-- Name: index_assessments_questions_on_difficulty; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_questions_on_difficulty ON public.assessments_questions USING btree (difficulty);


--
-- Name: index_assessments_questions_on_question_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_questions_on_question_type ON public.assessments_questions USING btree (question_type);


--
-- Name: index_assessments_user_answers_on_question_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_user_answers_on_question_id ON public.assessments_user_answers USING btree (question_id);


--
-- Name: index_assessments_user_answers_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_user_answers_on_user_id ON public.assessments_user_answers USING btree (user_id);


--
-- Name: index_assessments_voice_responses_on_assessment_result_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_voice_responses_on_assessment_result_id ON public.assessments_voice_responses USING btree (assessment_result_id);


--
-- Name: index_assessments_voice_responses_on_route_step_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_voice_responses_on_route_step_id ON public.assessments_voice_responses USING btree (route_step_id);


--
-- Name: index_assessments_voice_responses_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_voice_responses_on_status ON public.assessments_voice_responses USING btree (status);


--
-- Name: index_assessments_voice_responses_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_assessments_voice_responses_on_user_id ON public.assessments_voice_responses USING btree (user_id);


--
-- Name: index_community_engine_activities_on_action; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_activities_on_action ON public.community_engine_activities USING btree (action);


--
-- Name: index_community_engine_activities_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_activities_on_created_at ON public.community_engine_activities USING btree (created_at);


--
-- Name: index_community_engine_comments_on_parent_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_comments_on_parent_id ON public.community_engine_comments USING btree (parent_id);


--
-- Name: index_community_engine_comments_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_comments_on_user_id ON public.community_engine_comments USING btree (user_id);


--
-- Name: index_community_engine_comments_on_user_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_comments_on_user_id_and_created_at ON public.community_engine_comments USING btree (user_id, created_at);


--
-- Name: index_community_engine_follows_on_followed_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_follows_on_followed_id ON public.community_engine_follows USING btree (followed_id);


--
-- Name: index_community_engine_follows_on_follower_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_follows_on_follower_id ON public.community_engine_follows USING btree (follower_id);


--
-- Name: index_community_engine_likes_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_likes_on_user_id ON public.community_engine_likes USING btree (user_id);


--
-- Name: index_community_engine_notifications_on_actor_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_notifications_on_actor_id ON public.community_engine_notifications USING btree (actor_id);


--
-- Name: index_community_engine_notifications_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_notifications_on_user_id ON public.community_engine_notifications USING btree (user_id);


--
-- Name: index_community_engine_posts_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_posts_on_created_at ON public.community_engine_posts USING btree (created_at);


--
-- Name: index_community_engine_posts_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_posts_on_user_id ON public.community_engine_posts USING btree (user_id);


--
-- Name: index_community_engine_ratings_on_shared_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_ratings_on_shared_route_id ON public.community_engine_ratings USING btree (shared_route_id);


--
-- Name: index_community_engine_shared_routes_on_cloned_from_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_shared_routes_on_cloned_from_id ON public.community_engine_shared_routes USING btree (cloned_from_id);


--
-- Name: index_community_engine_shared_routes_on_learning_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_shared_routes_on_learning_route_id ON public.community_engine_shared_routes USING btree (learning_route_id);


--
-- Name: index_community_engine_shared_routes_on_share_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_community_engine_shared_routes_on_share_token ON public.community_engine_shared_routes USING btree (share_token);


--
-- Name: index_community_engine_shared_routes_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_community_engine_shared_routes_on_user_id ON public.community_engine_shared_routes USING btree (user_id);


--
-- Name: index_content_engine_ai_contents_on_ai_model; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_ai_contents_on_ai_model ON public.content_engine_ai_contents USING btree (ai_model);


--
-- Name: index_content_engine_ai_contents_on_audio_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_ai_contents_on_audio_status ON public.content_engine_ai_contents USING btree (audio_status);


--
-- Name: index_content_engine_ai_contents_on_cached; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_ai_contents_on_cached ON public.content_engine_ai_contents USING btree (cached);


--
-- Name: index_content_engine_ai_contents_on_content_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_ai_contents_on_content_type ON public.content_engine_ai_contents USING btree (content_type);


--
-- Name: index_content_engine_ai_contents_on_route_step_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_ai_contents_on_route_step_id ON public.content_engine_ai_contents USING btree (route_step_id);


--
-- Name: index_content_engine_content_caches_on_cache_key; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_content_engine_content_caches_on_cache_key ON public.content_engine_content_caches USING btree (cache_key);


--
-- Name: index_content_engine_content_caches_on_expires_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_content_caches_on_expires_at ON public.content_engine_content_caches USING btree (expires_at);


--
-- Name: index_content_engine_user_notes_on_route_step_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_user_notes_on_route_step_id ON public.content_engine_user_notes USING btree (route_step_id);


--
-- Name: index_content_engine_user_notes_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_content_engine_user_notes_on_user_id ON public.content_engine_user_notes USING btree (user_id);


--
-- Name: index_core_sessions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_core_sessions_on_user_id ON public.core_sessions USING btree (user_id);


--
-- Name: index_core_users_on_email; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_core_users_on_email ON public.core_users USING btree (email);


--
-- Name: index_core_users_on_onboarding_completed; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_core_users_on_onboarding_completed ON public.core_users USING btree (onboarding_completed);


--
-- Name: index_core_users_on_provider_and_uid; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_core_users_on_provider_and_uid ON public.core_users USING btree (provider, uid) WHERE (provider IS NOT NULL);


--
-- Name: index_core_users_on_remember_token; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_core_users_on_remember_token ON public.core_users USING btree (remember_token);


--
-- Name: index_core_users_on_role; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_core_users_on_role ON public.core_users USING btree (role);


--
-- Name: index_learning_routes_engine_knowledge_gaps_on_resolved; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_knowledge_gaps_on_resolved ON public.learning_routes_engine_knowledge_gaps USING btree (resolved);


--
-- Name: index_learning_routes_engine_knowledge_gaps_on_severity; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_knowledge_gaps_on_severity ON public.learning_routes_engine_knowledge_gaps USING btree (severity);


--
-- Name: index_learning_routes_engine_knowledge_gaps_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_knowledge_gaps_on_user_id ON public.learning_routes_engine_knowledge_gaps USING btree (user_id);


--
-- Name: index_learning_routes_engine_learning_profiles_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_learning_routes_engine_learning_profiles_on_user_id ON public.learning_routes_engine_learning_profiles USING btree (user_id);


--
-- Name: index_learning_routes_engine_learning_routes_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_learning_routes_on_status ON public.learning_routes_engine_learning_routes USING btree (status);


--
-- Name: index_learning_routes_engine_learning_routes_on_topic; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_learning_routes_on_topic ON public.learning_routes_engine_learning_routes USING btree (topic);


--
-- Name: index_learning_routes_engine_reinforcement_routes_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_reinforcement_routes_on_status ON public.learning_routes_engine_reinforcement_routes USING btree (status);


--
-- Name: index_learning_routes_engine_route_steps_on_learning_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_route_steps_on_learning_route_id ON public.learning_routes_engine_route_steps USING btree (learning_route_id);


--
-- Name: index_learning_routes_engine_route_steps_on_level; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_route_steps_on_level ON public.learning_routes_engine_route_steps USING btree (level);


--
-- Name: index_learning_routes_engine_route_steps_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_route_steps_on_status ON public.learning_routes_engine_route_steps USING btree (status);


--
-- Name: index_learning_routes_engine_tutor_messages_on_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_learning_routes_engine_tutor_messages_on_created_at ON public.learning_routes_engine_tutor_messages USING btree (created_at);


--
-- Name: index_owner_audit_events_on_action_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_owner_audit_events_on_action_and_created_at ON public.owner_audit_events USING btree (action, created_at);


--
-- Name: index_owner_audit_events_on_actor_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_owner_audit_events_on_actor_user_id ON public.owner_audit_events USING btree (actor_user_id);


--
-- Name: index_owner_audit_events_on_subject_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_owner_audit_events_on_subject_user_id ON public.owner_audit_events USING btree (subject_user_id);


--
-- Name: index_route_requests_on_learning_route_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_route_requests_on_learning_route_id ON public.route_requests USING btree (learning_route_id);


--
-- Name: index_route_requests_on_status; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_route_requests_on_status ON public.route_requests USING btree (status);


--
-- Name: index_route_requests_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_route_requests_on_user_id ON public.route_requests USING btree (user_id);


--
-- Name: index_route_requests_on_user_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_route_requests_on_user_id_and_created_at ON public.route_requests USING btree (user_id, created_at);


--
-- Name: index_user_engagements_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE UNIQUE INDEX index_user_engagements_on_user_id ON public.user_engagements USING btree (user_id);


--
-- Name: index_xp_transactions_on_source_type; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_xp_transactions_on_source_type ON public.xp_transactions USING btree (source_type);


--
-- Name: index_xp_transactions_on_source_type_and_source_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_xp_transactions_on_source_type_and_source_id ON public.xp_transactions USING btree (source_type, source_id);


--
-- Name: index_xp_transactions_on_user_id; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_xp_transactions_on_user_id ON public.xp_transactions USING btree (user_id);


--
-- Name: index_xp_transactions_on_user_id_and_created_at; Type: INDEX; Schema: public; Owner: -
--

CREATE INDEX index_xp_transactions_on_user_id_and_created_at ON public.xp_transactions USING btree (user_id, created_at);


--
-- Name: learning_routes_engine_learning_routes learning_routes_exactly_one_preview; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER learning_routes_exactly_one_preview AFTER INSERT OR UPDATE ON public.learning_routes_engine_learning_routes DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.learning_routes_engine_check_route_preview();


--
-- Name: learning_routes_engine_route_modules route_modules_exactly_one_preview; Type: TRIGGER; Schema: public; Owner: -
--

CREATE CONSTRAINT TRIGGER route_modules_exactly_one_preview AFTER INSERT OR DELETE OR UPDATE ON public.learning_routes_engine_route_modules DEFERRABLE INITIALLY DEFERRED FOR EACH ROW EXECUTE FUNCTION public.learning_routes_engine_check_route_preview();


--
-- Name: learning_routes_engine_route_modules route_modules_preserve_preview; Type: TRIGGER; Schema: public; Owner: -
--

CREATE TRIGGER route_modules_preserve_preview BEFORE DELETE OR UPDATE ON public.learning_routes_engine_route_modules FOR EACH ROW EXECUTE FUNCTION public.learning_routes_engine_preserve_preview();


--
-- Name: community_engine_posts fk_rails_006395ab32; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_posts
    ADD CONSTRAINT fk_rails_006395ab32 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: analytics_progress_snapshots fk_rails_00bb4387a7; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_progress_snapshots
    ADD CONSTRAINT fk_rails_00bb4387a7 FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id) ON DELETE CASCADE;


--
-- Name: learning_routes_engine_block_attempts fk_rails_056bc990f9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_block_attempts
    ADD CONSTRAINT fk_rails_056bc990f9 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: learning_routes_engine_route_steps fk_rails_059387e074; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_route_steps
    ADD CONSTRAINT fk_rails_059387e074 FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id);


--
-- Name: user_engagements fk_rails_0ab45e470a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.user_engagements
    ADD CONSTRAINT fk_rails_0ab45e470a FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_ratings fk_rails_0cdea3c2d0; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_ratings
    ADD CONSTRAINT fk_rails_0cdea3c2d0 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: learning_routes_engine_knowledge_gaps fk_rails_0f45add71e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_knowledge_gaps
    ADD CONSTRAINT fk_rails_0f45add71e FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: learning_routes_engine_learning_routes fk_rails_194c3002e5; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_learning_routes
    ADD CONSTRAINT fk_rails_194c3002e5 FOREIGN KEY (learning_profile_id) REFERENCES public.learning_routes_engine_learning_profiles(id);


--
-- Name: owner_audit_events fk_rails_1b6fee73bf; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_audit_events
    ADD CONSTRAINT fk_rails_1b6fee73bf FOREIGN KEY (subject_user_id) REFERENCES public.core_users(id) ON DELETE SET NULL;


--
-- Name: owner_audit_events fk_rails_1d6fb8faaa; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.owner_audit_events
    ADD CONSTRAINT fk_rails_1d6fb8faaa FOREIGN KEY (actor_user_id) REFERENCES public.core_users(id) ON DELETE SET NULL;


--
-- Name: learning_routes_engine_block_attempts fk_rails_21bb6b49a8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_block_attempts
    ADD CONSTRAINT fk_rails_21bb6b49a8 FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id) ON DELETE CASCADE;


--
-- Name: community_engine_ratings fk_rails_292cffb972; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_ratings
    ADD CONSTRAINT fk_rails_292cffb972 FOREIGN KEY (shared_route_id) REFERENCES public.community_engine_shared_routes(id);


--
-- Name: learning_routes_engine_learning_profiles fk_rails_29ea26ac02; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_learning_profiles
    ADD CONSTRAINT fk_rails_29ea26ac02 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: learning_routes_engine_reinforcement_routes fk_rails_46e4e25295; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_reinforcement_routes
    ADD CONSTRAINT fk_rails_46e4e25295 FOREIGN KEY (knowledge_gap_id) REFERENCES public.learning_routes_engine_knowledge_gaps(id);


--
-- Name: assessments_user_answers fk_rails_4f50f31104; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_user_answers
    ADD CONSTRAINT fk_rails_4f50f31104 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: analytics_study_sessions fk_rails_4fca0e2adb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_study_sessions
    ADD CONSTRAINT fk_rails_4fca0e2adb FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id) ON DELETE SET NULL;


--
-- Name: assessments_voice_responses fk_rails_5d2ca49efe; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_voice_responses
    ADD CONSTRAINT fk_rails_5d2ca49efe FOREIGN KEY (assessment_result_id) REFERENCES public.assessments_assessment_results(id);


--
-- Name: community_engine_notifications fk_rails_5dfc4a53c1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_notifications
    ADD CONSTRAINT fk_rails_5dfc4a53c1 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_activities fk_rails_5fd18288d8; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_activities
    ADD CONSTRAINT fk_rails_5fd18288d8 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: learning_routes_engine_route_modules fk_rails_624cf70767; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_route_modules
    ADD CONSTRAINT fk_rails_624cf70767 FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id) ON DELETE CASCADE;


--
-- Name: community_engine_comments fk_rails_71864de04d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_comments
    ADD CONSTRAINT fk_rails_71864de04d FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: analytics_learning_metrics fk_rails_7559f01c3c; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_learning_metrics
    ADD CONSTRAINT fk_rails_7559f01c3c FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: analytics_progress_snapshots fk_rails_7a16395d73; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_progress_snapshots
    ADD CONSTRAINT fk_rails_7a16395d73 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: analytics_study_sessions fk_rails_7fad9e25d1; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_study_sessions
    ADD CONSTRAINT fk_rails_7fad9e25d1 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: assessments_questions fk_rails_80956120d9; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_questions
    ADD CONSTRAINT fk_rails_80956120d9 FOREIGN KEY (assessment_id) REFERENCES public.assessments_assessments(id);


--
-- Name: active_storage_variant_records fk_rails_993965df05; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_variant_records
    ADD CONSTRAINT fk_rails_993965df05 FOREIGN KEY (blob_id) REFERENCES public.active_storage_blobs(id);


--
-- Name: route_requests fk_rails_9c0f619a9e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_requests
    ADD CONSTRAINT fk_rails_9c0f619a9e FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id);


--
-- Name: assessments_assessments fk_rails_ad2ce7bb36; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_assessments
    ADD CONSTRAINT fk_rails_ad2ce7bb36 FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id) ON DELETE CASCADE;


--
-- Name: analytics_study_sessions fk_rails_ae1138c06d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.analytics_study_sessions
    ADD CONSTRAINT fk_rails_ae1138c06d FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id) ON DELETE SET NULL;


--
-- Name: content_engine_user_notes fk_rails_b091220a8e; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_user_notes
    ADD CONSTRAINT fk_rails_b091220a8e FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id) ON DELETE CASCADE;


--
-- Name: community_engine_follows fk_rails_b703a3d4a6; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_follows
    ADD CONSTRAINT fk_rails_b703a3d4a6 FOREIGN KEY (follower_id) REFERENCES public.core_users(id);


--
-- Name: content_engine_ai_contents fk_rails_bb1bf2f1eb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_ai_contents
    ADD CONSTRAINT fk_rails_bb1bf2f1eb FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id) ON DELETE CASCADE;


--
-- Name: learning_routes_engine_reinforcement_routes fk_rails_bb9ddc8d6d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_reinforcement_routes
    ADD CONSTRAINT fk_rails_bb9ddc8d6d FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id);


--
-- Name: route_requests fk_rails_c0a9caa7ca; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.route_requests
    ADD CONSTRAINT fk_rails_c0a9caa7ca FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: content_engine_user_notes fk_rails_c1e7e1c510; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.content_engine_user_notes
    ADD CONSTRAINT fk_rails_c1e7e1c510 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: active_storage_attachments fk_rails_c3b3935057; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.active_storage_attachments
    ADD CONSTRAINT fk_rails_c3b3935057 FOREIGN KEY (blob_id) REFERENCES public.active_storage_blobs(id);


--
-- Name: learning_routes_engine_knowledge_gaps fk_rails_c750cf5413; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.learning_routes_engine_knowledge_gaps
    ADD CONSTRAINT fk_rails_c750cf5413 FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id);


--
-- Name: assessments_user_answers fk_rails_c83622d311; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_user_answers
    ADD CONSTRAINT fk_rails_c83622d311 FOREIGN KEY (question_id) REFERENCES public.assessments_questions(id);


--
-- Name: assessments_voice_responses fk_rails_d01c7c8f3b; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_voice_responses
    ADD CONSTRAINT fk_rails_d01c7c8f3b FOREIGN KEY (route_step_id) REFERENCES public.learning_routes_engine_route_steps(id);


--
-- Name: ai_orchestrator_ai_interactions fk_rails_d03f0ec112; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.ai_orchestrator_ai_interactions
    ADD CONSTRAINT fk_rails_d03f0ec112 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE SET NULL;


--
-- Name: assessments_assessment_results fk_rails_d1657a302f; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_assessment_results
    ADD CONSTRAINT fk_rails_d1657a302f FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- Name: community_engine_shared_routes fk_rails_d4a5b79f88; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_shared_routes
    ADD CONSTRAINT fk_rails_d4a5b79f88 FOREIGN KEY (learning_route_id) REFERENCES public.learning_routes_engine_learning_routes(id);


--
-- Name: community_engine_notifications fk_rails_d630ad13fb; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_notifications
    ADD CONSTRAINT fk_rails_d630ad13fb FOREIGN KEY (actor_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_shared_routes fk_rails_dd0482774d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_shared_routes
    ADD CONSTRAINT fk_rails_dd0482774d FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: assessments_assessment_results fk_rails_dd87aa159a; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_assessment_results
    ADD CONSTRAINT fk_rails_dd87aa159a FOREIGN KEY (assessment_id) REFERENCES public.assessments_assessments(id);


--
-- Name: xp_transactions fk_rails_de5b4eff52; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.xp_transactions
    ADD CONSTRAINT fk_rails_de5b4eff52 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_likes fk_rails_f30e2abc7d; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_likes
    ADD CONSTRAINT fk_rails_f30e2abc7d FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: assessments_voice_responses fk_rails_f37aed0074; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.assessments_voice_responses
    ADD CONSTRAINT fk_rails_f37aed0074 FOREIGN KEY (user_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_follows fk_rails_fb839fdb79; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_follows
    ADD CONSTRAINT fk_rails_fb839fdb79 FOREIGN KEY (followed_id) REFERENCES public.core_users(id);


--
-- Name: community_engine_comments fk_rails_fd578aef75; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.community_engine_comments
    ADD CONSTRAINT fk_rails_fd578aef75 FOREIGN KEY (parent_id) REFERENCES public.community_engine_comments(id) ON DELETE CASCADE;


--
-- Name: core_sessions fk_rails_ff3afd7650; Type: FK CONSTRAINT; Schema: public; Owner: -
--

ALTER TABLE ONLY public.core_sessions
    ADD CONSTRAINT fk_rails_ff3afd7650 FOREIGN KEY (user_id) REFERENCES public.core_users(id) ON DELETE CASCADE;


--
-- PostgreSQL database dump complete
--

SET search_path TO "$user", public;

INSERT INTO "schema_migrations" (version) VALUES
('20260901000003'),
('20260901000002'),
('20260901000001'),
('20260831000002'),
('20260824000001'),
('20260811000001'),
('20260708000001'),
('20260702000001'),
('20260428000001'),
('20260423000001'),
('20260415000001'),
('20260318192334'),
('20260313162257'),
('20260313152725'),
('20260312040741'),
('20260307010000'),
('20260307002634'),
('20260306240000'),
('20260306230000'),
('20260306220000'),
('20260306210000'),
('20260306200000'),
('20260304173357'),
('20260227175838'),
('20260225204430'),
('20260225000002'),
('20260225000001'),
('20260224000007'),
('20260224000006'),
('20260224000005'),
('20260224000004'),
('20260224000003'),
('20260224000002'),
('20260224000001'),
('20260223000003'),
('20260223000002'),
('20260223000001'),
('20260220180001'),
('20260218180003'),
('20260218180002'),
('20260218180001'),
('20260218171611'),
('20260213100002'),
('20260213100001'),
('20260213000016'),
('20260213000015'),
('20250213000052'),
('20250213000051'),
('20250213000050'),
('20250213000043'),
('20250213000042'),
('20250213000041'),
('20250213000040'),
('20250213000033'),
('20250213000032'),
('20250213000031'),
('20250213000030'),
('20250213000021'),
('20250213000020'),
('20250213000014'),
('20250213000013'),
('20250213000012'),
('20250213000011'),
('20250213000010'),
('20250213000003'),
('20250213000002'),
('20250213000001');
