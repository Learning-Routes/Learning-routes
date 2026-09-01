namespace :owner do
  desc "Promote an existing, credential-authenticated account to the sole owner"
  task promote: :environment do
    Owner::Promotion.call(email: ENV["OWNER_EMAIL"], password: ENV["OWNER_PASSWORD"])
    puts "Owner promotion completed; existing sessions were invalidated."
  end
end
