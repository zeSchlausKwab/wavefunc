import 'package:flutter/foundation.dart';

import '../../../../data/services/wavefunc_backend.dart';
import '../../../../domain/models/social.dart';
import '../../auth/view_models/auth_view_model.dart';

/// MVVM ViewModel for the `#wavefunc` Community Feed (kind 1 + legacy kind 1111).
class CommunityViewModel extends ChangeNotifier {
  CommunityViewModel({
    required this._backend,
    required this._authViewModel,
  });

  final WavefuncBackend _backend;
  final AuthViewModel _authViewModel;

  List<CommunityPost> _allPosts = const [];
  String _selectedCategory = 'all';
  bool _isLoading = false;
  bool _isPosting = false;
  String? _errorMessage;

  static const categories = ['all', 'general', 'greeting', 'feature', 'bug'];

  String get selectedCategory => _selectedCategory;
  bool get isLoading => _isLoading;
  bool get isPosting => _isPosting;
  String? get errorMessage => _errorMessage;

  List<CommunityPost> get rootPosts {
    final roots = _allPosts.where((p) => !p.isReply).toList();
    if (_selectedCategory == 'all') return roots;
    if (_selectedCategory == 'general') {
      return roots.where((p) => p.categories.isEmpty).toList();
    }
    return roots
        .where(
          (p) => p.categories
              .any((c) => c.toLowerCase() == _selectedCategory),
        )
        .toList();
  }

  List<CommunityPost> repliesFor(String postId) {
    final list = _allPosts
        .where(
          (p) => p.isReply && (p.rootId == postId || p.parentId == postId),
        )
        .toList();
    list.sort((a, b) => a.createdAt.compareTo(b.createdAt));
    return list;
  }

  void setCategory(String category) {
    _selectedCategory = category;
    notifyListeners();
  }

  Future<void> refresh() async {
    _isLoading = true;
    _errorMessage = null;
    notifyListeners();
    try {
      _allPosts = await _backend.fetchCommunityPosts(limit: 100);
    } catch (e) {
      _errorMessage = 'Could not load community feed: $e';
    } finally {
      _isLoading = false;
      notifyListeners();
    }
  }

  Future<bool> publishPost({
    required String content,
    String category = 'general',
    CommunityPost? replyTo,
  }) async {
    if (content.trim().isEmpty) return false;
    _isPosting = true;
    _errorMessage = null;
    notifyListeners();
    try {
      await _authViewModel.executeSignedAction(
        (backend) => backend.postCommunityNote(
          content: content.trim(),
          category: replyTo == null ? category : null,
          replyToId: replyTo?.id,
          replyToPubkey: replyTo?.pubkey,
          rootId: replyTo?.rootId ?? replyTo?.id,
          rootPubkey: replyTo?.pubkey,
        ),
      );
      await refresh();
      return true;
    } catch (e) {
      _errorMessage = '$e';
      return false;
    } finally {
      _isPosting = false;
      notifyListeners();
    }
  }
}
