# frozen_string_literal: true

require "test_helper"

module ContentEngine
  class AudioStorageTest < ActiveSupport::TestCase
    setup do
      @audio_root = Rails.root.join("storage", "audio")
      @sections_root = @audio_root.join("sections")
      @outside_root = Rails.root.join("storage", "audio-storage-test-outside")
      @sibling_root = Rails.root.join("storage", "audio-escape")

      [@audio_root, @sections_root, @outside_root, @sibling_root].each(&:mkpath)
      @created_paths = []
    end

    teardown do
      @created_paths.reverse_each do |path|
        FileUtils.rm_f(path)
      end
      [@outside_root, @sibling_root].each do |directory|
        Dir.rmdir(directory) if directory.directory? && directory.empty?
      end
    end

    test "resolves an existing MP3 inside the audio root" do
      path = write_file(@audio_root.join("audio_storage_valid.mp3"), "valid audio")

      assert_equal path.realpath,
                   AudioStorage.resolve("/storage/audio/audio_storage_valid.mp3", scope: :audio)
    end

    test "resolves an existing MP3 inside the sections root" do
      path = write_file(@sections_root.join("audio_storage_section.mp3"), "section audio")

      assert_equal path.realpath,
                   AudioStorage.resolve(
                     "/storage/audio/sections/audio_storage_section.mp3",
                     scope: :sections
                   )
    end

    test "rejects traversal outside the selected root" do
      write_file(Rails.root.join("storage", "secret.mp3"), "secret")

      assert_nil AudioStorage.resolve("/storage/audio/../secret.mp3", scope: :audio)
    end

    test "rejects a sibling directory with the same prefix" do
      write_file(@sibling_root.join("secret.mp3"), "secret")

      assert_nil AudioStorage.resolve("/storage/audio-escape/secret.mp3", scope: :audio)
    end

    test "rejects non-MP3 files" do
      write_file(@audio_root.join("audio_storage_invalid.txt"), "not audio")

      assert_nil AudioStorage.resolve("/storage/audio/audio_storage_invalid.txt", scope: :audio)
    end

    test "rejects missing files and directories" do
      assert_nil AudioStorage.resolve("/storage/audio/audio_storage_missing.mp3", scope: :audio)
      assert_nil AudioStorage.resolve("/storage/audio", scope: :audio)
    end

    test "rejects files below the requested minimum size" do
      write_file(@audio_root.join("audio_storage_tiny.mp3"), "tiny")

      assert_nil AudioStorage.resolve(
        "/storage/audio/audio_storage_tiny.mp3",
        scope: :audio,
        minimum_size: 1_024
      )
    end

    test "rejects a symlink that escapes the audio root" do
      outside = write_file(@outside_root.join("secret.mp3"), "outside audio")
      symlink = @audio_root.join("audio_storage_symlink.mp3")
      File.symlink(outside, symlink)
      @created_paths << symlink

      assert_nil AudioStorage.resolve("/storage/audio/audio_storage_symlink.mp3", scope: :audio)
    rescue NotImplementedError, Errno::EACCES
      skip "symlink creation is unavailable on this platform"
    end

    test "deletes only a validated MP3" do
      valid = write_file(@audio_root.join("audio_storage_delete.mp3"), "delete me")
      outside = write_file(@sibling_root.join("keep.mp3"), "keep me")

      assert AudioStorage.delete("/storage/audio/audio_storage_delete.mp3", scope: :audio)
      assert_not valid.exist?

      assert_not AudioStorage.delete("/storage/audio-escape/keep.mp3", scope: :audio)
      assert outside.exist?
    end

    test "rejects unknown storage scopes" do
      assert_nil AudioStorage.resolve("/storage/audio/file.mp3", scope: :unknown)
    end

    private

    def write_file(path, contents)
      path.dirname.mkpath
      File.binwrite(path, contents)
      @created_paths << path
      path
    end
  end
end
