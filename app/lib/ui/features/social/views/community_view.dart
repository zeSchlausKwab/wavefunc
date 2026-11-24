import 'package:material_ui/material_ui.dart';

import '../../../../domain/models/social.dart';
import '../../../core/theme/sonic_machine_theme.dart';
import '../../../core/widgets/rich_note_content.dart';
import '../../../core/widgets/sonic_plate.dart';
import '../../../core/widgets/station_thumbnail.dart';
import '../../../core/widgets/video_player_sheet.dart';
import '../../auth/view_models/auth_view_model.dart';
import '../../crate/view_models/crate_view_model.dart';
import '../../crate/views/media_forge_sheet.dart';
import '../../player/view_models/player_view_model.dart';
import '../view_models/community_view_model.dart';
import 'user_profile_sheet.dart';

enum _FeedSegment { notes, signals }

/// `#wavefunc` Community Feed + Global Song Signals (`kind 31337`) view.
class CommunityView extends StatefulWidget {
  const CommunityView({
    super.key,
    required this.communityViewModel,
    required this.authViewModel,
    required this.onRequestLogin,
    this.playerViewModel,
    this.crateViewModel,
  });

  final CommunityViewModel communityViewModel;
  final AuthViewModel authViewModel;
  final VoidCallback onRequestLogin;
  final PlayerViewModel? playerViewModel;
  final CrateViewModel? crateViewModel;

  @override
  State<CommunityView> createState() => _CommunityViewState();
}

class _CommunityViewState extends State<CommunityView> {
  final _composerController = TextEditingController();
  String _composerCategory = 'general';
  CommunityPost? _replyTarget;
  _FeedSegment _segment = _FeedSegment.notes;

  @override
  void dispose() {
    _composerController.dispose();
    super.dispose();
  }

  Future<void> _submitPost() async {
    if (!widget.authViewModel.isLoggedIn) {
      widget.onRequestLogin();
      return;
    }
    final text = _composerController.text.trim();
    if (text.isEmpty) return;

    final ok = await widget.communityViewModel.publishPost(
      content: text,
      category: _composerCategory,
      replyTo: _replyTarget,
    );
    if (ok && mounted) {
      _composerController.clear();
      setState(() => _replyTarget = null);
      ScaffoldMessenger.of(context).showSnackBar(
        const SnackBar(content: Text('Published to #wavefunc')),
      );
    }
  }

  @override
  Widget build(BuildContext context) {
    return ListenableBuilder(
      listenable: Listenable.merge([
        widget.communityViewModel,
        widget.authViewModel,
      ]),
      builder: (context, _) {
        final vm = widget.communityViewModel;
        final auth = widget.authViewModel;
        final posts = vm.rootPosts;

        return RefreshIndicator(
          color: SonicColors.signalRed,
          backgroundColor: SonicColors.foundation,
          onRefresh: vm.refresh,
          child: CustomScrollView(
            physics: const AlwaysScrollableScrollPhysics(),
            slivers: [
              SliverToBoxAdapter(
                child: Padding(
                  padding: const EdgeInsets.fromLTRB(16, 16, 16, 12),
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        'NOSTR_DISPATCH // #WAVEFUNC',
                        style: SonicMachineTheme.labelTech(
                          fontSize: 10,
                          color: SonicColors.signalRed,
                          letterSpacing: 2.0,
                        ),
                      ),
                      const SizedBox(height: 2),
                      Text(
                        _segment == _FeedSegment.notes
                            ? 'COMMUNITY'
                            : 'SONG SIGNALS',
                        style: Theme.of(context)
                            .textTheme
                            .displayMedium
                            ?.copyWith(fontSize: 30),
                      ),
                      const SizedBox(height: 10),
                      Row(
                        children: [
                          SonicTag(
                            label: 'COMMUNITY NOTES',
                            highlighted: _segment == _FeedSegment.notes,
                            onTap: () =>
                                setState(() => _segment = _FeedSegment.notes),
                          ),
                          const SizedBox(width: 8),
                          SonicTag(
                            label:
                                'SONG SIGNALS (${vm.signalSongs.length})',
                            highlighted: _segment == _FeedSegment.signals,
                            onTap: () {
                              setState(() => _segment = _FeedSegment.signals);
                              if (vm.signalSongs.isEmpty) {
                                vm.refreshSignals();
                              }
                            },
                          ),
                        ],
                      ),
                      const SizedBox(height: 14),

                      if (_segment == _FeedSegment.notes) ...[
                        // ── Composer plate ──
                      SonicPlate(
                        backgroundColor: SonicColors.surfacePlate,
                        shadowOffset: const Offset(4, 4),
                        padding: const EdgeInsets.all(12),
                        child: Column(
                          crossAxisAlignment: CrossAxisAlignment.stretch,
                          children: [
                            if (_replyTarget != null) ...[
                              Row(
                                children: [
                                  Expanded(
                                    child: Text(
                                      'REPLYING TO ${_replyTarget!.authorName.toUpperCase()}',
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9.5,
                                        color: SonicColors.signalRed,
                                      ),
                                    ),
                                  ),
                                  GestureDetector(
                                    onTap: () =>
                                        setState(() => _replyTarget = null),
                                    child: const Icon(Icons.close, size: 16),
                                  ),
                                ],
                              ),
                              const SizedBox(height: 6),
                            ],
                            TextField(
                              controller: _composerController,
                              maxLines: 3,
                              minLines: 2,
                              decoration: InputDecoration(
                                hintText: auth.isLoggedIn
                                    ? (_replyTarget != null
                                        ? 'WRITE_REPLY...'
                                        : 'BROADCAST_TO_#WAVEFUNC...')
                                    : 'SIGN IN TO POST TO #WAVEFUNC...',
                              ),
                            ),
                            const SizedBox(height: 10),
                            Row(
                              children: [
                                if (_replyTarget == null)
                                  Expanded(
                                    child: SingleChildScrollView(
                                      scrollDirection: Axis.horizontal,
                                      child: Row(
                                        children: [
                                          for (final cat in const [
                                            'general',
                                            'greeting',
                                            'feature',
                                            'bug',
                                          ])
                                            Padding(
                                              padding: const EdgeInsets.only(
                                                right: 6,
                                              ),
                                              child: SonicTag(
                                                label: cat,
                                                highlighted:
                                                    _composerCategory == cat,
                                                onTap: () => setState(
                                                  () => _composerCategory = cat,
                                                ),
                                              ),
                                            ),
                                        ],
                                      ),
                                    ),
                                  )
                                else
                                  const Spacer(),
                                const SizedBox(width: 8),
                                SonicPowerButton(
                                  label: auth.isLoggedIn
                                      ? (vm.isPosting ? 'Sending' : 'Post')
                                      : 'Sign In',
                                  icon: auth.isLoggedIn
                                      ? Icons.send
                                      : Icons.login,
                                  compact: true,
                                  onPressed: vm.isPosting ? null : _submitPost,
                                ),
                              ],
                            ),
                          ],
                        ),
                      ),
                      const SizedBox(height: 14),

                      // ── Category Filter Bar ──
                      SingleChildScrollView(
                        scrollDirection: Axis.horizontal,
                        child: Row(
                          children: CommunityViewModel.categories.map((cat) {
                            return Padding(
                              padding: const EdgeInsets.only(right: 6),
                              child: SonicTag(
                                label: cat,
                                highlighted: vm.selectedCategory == cat,
                                onTap: () => vm.setCategory(cat),
                              ),
                            );
                          }).toList(),
                        ),
                      ),
                      const SizedBox(height: 12),
                      SonicSectionHeader(
                        title: 'TRANSMISSIONS',
                        trailing: Text(
                          '${posts.length} NOTES',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 10,
                            color: SonicColors.seamOutline,
                          ),
                        ),
                      ),
                      ] else
                        SonicSectionHeader(
                          title: 'RECENT_SONG_SIGNALS',
                          accent: true,
                          trailing: Text(
                            '${vm.signalSongs.length} TRACKS',
                            style: SonicMachineTheme.labelTech(
                              fontSize: 10,
                              color: SonicColors.seamOutline,
                            ),
                          ),
                        ),
                    ],
                  ),
                ),
              ),
              if (vm.errorMessage != null)
                SliverToBoxAdapter(
                  child: Padding(
                    padding: const EdgeInsets.symmetric(
                      horizontal: 16,
                      vertical: 4,
                    ),
                    child: SonicPlate(
                      backgroundColor: SonicColors.signalRed,
                      padding: const EdgeInsets.all(10),
                      child: Text(
                        vm.errorMessage!,
                        style: SonicMachineTheme.labelTech(
                          fontSize: 11,
                          color: SonicColors.onSignal,
                        ),
                      ),
                    ),
                  ),
                ),
              if (_segment == _FeedSegment.signals) ...[
                if (vm.isLoadingSignals && vm.signalSongs.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: CircularProgressIndicator(
                        color: SonicColors.signalRed,
                      ),
                    ),
                  )
                else if (vm.signalSongs.isEmpty)
                  const SliverFillRemaining(
                    hasScrollBody: false,
                    child: Center(
                      child: Text('NO GLOBAL SONG SIGNALS FOUND YET'),
                    ),
                  )
                else
                  SliverPadding(
                    padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                    sliver: SliverList.separated(
                      itemCount: vm.signalSongs.length,
                      separatorBuilder: (_, _) => const SizedBox(height: 10),
                      itemBuilder: (context, index) {
                        final song = vm.signalSongs[index];
                        final hasAudio = song.audioUrl != null &&
                            song.audioUrl!.trim().isNotEmpty;
                        return SonicPlate(
                          shadowOffset: const Offset(3, 3),
                          shadowColor: hasAudio
                              ? SonicColors.voltageCyan
                              : SonicColors.ink,
                          padding: const EdgeInsets.all(10),
                          child: Row(
                            children: [
                              StationThumbnail(
                                url: song.thumb ?? song.coverArt,
                                size: 44,
                                highlight: hasAudio,
                              ),
                              const SizedBox(width: 10),
                              Expanded(
                                child: Column(
                                  crossAxisAlignment: CrossAxisAlignment.start,
                                  children: [
                                    Text(
                                      song.title,
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: Theme.of(context)
                                          .textTheme
                                          .titleSmall,
                                    ),
                                    const SizedBox(height: 2),
                                    Text(
                                      song.subtitle.toUpperCase(),
                                      maxLines: 1,
                                      overflow: TextOverflow.ellipsis,
                                      style: SonicMachineTheme.labelTech(
                                        fontSize: 9,
                                        color: SonicColors.seamOutline,
                                      ),
                                    ),
                                  ],
                                ),
                              ),
                              IconButton(
                                tooltip: 'View saver profile',
                                icon: const Icon(
                                  Icons.person_outline,
                                  size: 18,
                                  color: SonicColors.ink,
                                ),
                                onPressed: () => UserProfileSheet.open(
                                  context,
                                  pubkey: song.pubkey,
                                  loadProfile: vm.fetchUserProfile,
                                ),
                              ),
                              if (hasAudio &&
                                  (isVideoMediaUrl(song.audioUrl) ||
                                      widget.playerViewModel != null))
                                IconButton(
                                  tooltip: isVideoMediaUrl(song.audioUrl)
                                      ? 'Play Blossom video'
                                      : 'Play Blossom audio',
                                  icon: Icon(
                                    isVideoMediaUrl(song.audioUrl)
                                        ? Icons.smart_display
                                        : Icons.play_arrow,
                                    size: 22,
                                    color: SonicColors.signalRed,
                                  ),
                                  onPressed: () {
                                    if (isVideoMediaUrl(song.audioUrl)) {
                                      VideoPlayerSheet.open(
                                        context,
                                        url: song.audioUrl!,
                                        title: song.title,
                                        subtitle: song.artist,
                                        onBeforeOpen: () async {
                                          if (widget.playerViewModel != null &&
                                              widget.playerViewModel!.snapshot
                                                  .isPlaying) {
                                            await widget.playerViewModel!
                                                .pause();
                                          }
                                        },
                                      );
                                    } else {
                                      widget.playerViewModel!
                                          .playSavedSong(song);
                                    }
                                  },
                                ),
                              if (widget.crateViewModel != null)
                                IconButton(
                                  tooltip: 'Backup to Blossom',
                                  icon: Icon(
                                    hasAudio
                                        ? Icons.cloud_done_outlined
                                        : Icons.cloud_upload_outlined,
                                    size: 18,
                                    color: SonicColors.ink,
                                  ),
                                  onPressed: () {
                                    if (!widget.authViewModel.isLoggedIn) {
                                      widget.onRequestLogin();
                                      return;
                                    }
                                    MediaForgeSheet.open(
                                      context,
                                      crateViewModel: widget.crateViewModel!,
                                      authViewModel: widget.authViewModel,
                                      onRequestLogin: widget.onRequestLogin,
                                      existingSong: song,
                                    );
                                  },
                                ),
                            ],
                          ),
                        );
                      },
                    ),
                  ),
              ] else if (vm.isLoading && posts.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: CircularProgressIndicator(
                      color: SonicColors.signalRed,
                    ),
                  ),
                )
              else if (posts.isEmpty)
                const SliverFillRemaining(
                  hasScrollBody: false,
                  child: Center(
                    child: Text('NO #WAVEFUNC POSTS IN THIS FILTER'),
                  ),
                )
              else
                SliverPadding(
                  padding: const EdgeInsets.fromLTRB(16, 4, 16, 120),
                  sliver: SliverList.separated(
                    itemCount: posts.length,
                    separatorBuilder: (_, _) => const SizedBox(height: 12),
                    itemBuilder: (context, index) {
                      final post = posts[index];
                      final replies = vm.repliesFor(post.id);
                      return _CommunityPostCard(
                        post: post,
                        replies: replies,
                        onReply: () => setState(() => _replyTarget = post),
                        onOpenAuthor: () => UserProfileSheet.open(
                          context,
                          pubkey: post.pubkey,
                          loadProfile: vm.fetchUserProfile,
                          initialName: post.authorName,
                          initialPicture: post.authorPicture,
                        ),
                        playerViewModel: widget.playerViewModel,
                      );
                    },
                  ),
                ),
            ],
          ),
        );
      },
    );
  }
}

class _CommunityPostCard extends StatelessWidget {
  const _CommunityPostCard({
    required this.post,
    required this.replies,
    required this.onReply,
    required this.onOpenAuthor,
    this.playerViewModel,
  });

  final CommunityPost post;
  final List<CommunityPost> replies;
  final VoidCallback onReply;
  final VoidCallback onOpenAuthor;
  final PlayerViewModel? playerViewModel;

  void _playAttachedAudio(String url) {
    final p = playerViewModel;
    if (p == null) return;
    p.playSavedSong(
      SavedSong(
        id: url.hashCode.toString(),
        pubkey: post.pubkey,
        songId: url.hashCode.toString(),
        address: 'audio:$url',
        title: 'Attached Audio',
        artist: post.authorName,
        audioUrl: url,
      ),
    );
  }

  Future<void> _pauseBeforeVideo() async {
    if (playerViewModel != null && playerViewModel!.snapshot.isPlaying) {
      await playerViewModel!.pause();
    }
  }

  @override
  Widget build(BuildContext context) {
    return SonicPlate(
      backgroundColor: SonicColors.foundation,
      shadowOffset: const Offset(4, 4),
      padding: const EdgeInsets.all(12),
      child: Column(
        crossAxisAlignment: CrossAxisAlignment.start,
        children: [
          Row(
            children: [
              GestureDetector(
                onTap: onOpenAuthor,
                child: StationThumbnail(url: post.authorPicture, size: 32),
              ),
              const SizedBox(width: 10),
              Expanded(
                child: GestureDetector(
                  onTap: onOpenAuthor,
                  child: Column(
                    crossAxisAlignment: CrossAxisAlignment.start,
                    children: [
                      Text(
                        post.authorName,
                        maxLines: 1,
                        overflow: TextOverflow.ellipsis,
                        style: Theme.of(context).textTheme.titleSmall,
                      ),
                      Text(
                        _relativeTime(post.createdAt),
                        style: SonicMachineTheme.labelTech(
                          fontSize: 9,
                          color: SonicColors.seamOutline,
                        ),
                      ),
                    ],
                  ),
                ),
              ),
              ...post.categories.take(2).map(
                    (c) => Padding(
                      padding: const EdgeInsets.only(left: 4),
                      child: SonicTag(label: c, inverted: true),
                    ),
                  ),
            ],
          ),
          const SizedBox(height: 10),
          RichNoteContent(
            content: post.content,
            onPlayAudioUrl: playerViewModel != null ? _playAttachedAudio : null,
            onBeforePlayVideo: _pauseBeforeVideo,
          ),
          const SizedBox(height: 10),
          Row(
            children: [
              SonicTag(
                label: 'REPLY (${replies.length})',
                onTap: onReply,
              ),
            ],
          ),
          if (replies.isNotEmpty) ...[
            const SizedBox(height: 10),
            Container(
              padding: const EdgeInsets.only(left: 10),
              decoration: const BoxDecoration(
                border: Border(
                  left: BorderSide(color: SonicColors.seamOutline, width: 2),
                ),
              ),
              child: Column(
                crossAxisAlignment: CrossAxisAlignment.start,
                children: replies.take(4).map((r) {
                  return Padding(
                    padding: const EdgeInsets.only(bottom: 8),
                    child: Column(
                      crossAxisAlignment: CrossAxisAlignment.start,
                      children: [
                        Text(
                          '${r.authorName.toUpperCase()} • ${_relativeTime(r.createdAt)}',
                          style: SonicMachineTheme.labelTech(
                            fontSize: 9,
                            color: SonicColors.seamOutline,
                          ),
                        ),
                        const SizedBox(height: 2),
                        RichNoteContent(
                          content: r.content,
                          textStyle: Theme.of(context).textTheme.bodySmall,
                          onPlayAudioUrl:
                              playerViewModel != null ? _playAttachedAudio : null,
                          onBeforePlayVideo: _pauseBeforeVideo,
                        ),
                      ],
                    ),
                  );
                }).toList(),
              ),
            ),
          ],
        ],
      ),
    );
  }
}

String _relativeTime(int unixSeconds) {
  if (unixSeconds <= 0) return '';
  final diff = DateTime.now()
      .difference(DateTime.fromMillisecondsSinceEpoch(unixSeconds * 1000));
  if (diff.inMinutes < 1) return 'JUST NOW';
  if (diff.inHours < 1) return '${diff.inMinutes}M AGO';
  if (diff.inDays < 1) return '${diff.inHours}H AGO';
  if (diff.inDays < 30) return '${diff.inDays}D AGO';
  return '${(diff.inDays / 30).floor()}MO AGO';
}
