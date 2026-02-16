# frozen_string_literal: true

# Seed data for testing the content delivery system.
# Creates route steps, AI content, and an assessment for the existing route.

def seed_content_delivery
  puts "=== Content Delivery Seed ==="

  profile = LearningRoutesEngine::LearningProfile.first
  unless profile
    puts "  No learning profile found. Skipping."
    return
  end

  user = profile.user
  route = profile.learning_routes.first
  unless route
    puts "  No learning route found. Skipping."
    return
  end

# Clean existing steps/content for idempotency
route.route_steps.destroy_all
puts "  Cleared existing steps."

# Activate the route
route.update!(
  status: :active,
  generation_status: "completed",
  generated_at: Time.current,
  total_steps: 8,
  current_step: 2
)
puts "  Route activated: #{route.topic} (#{route.id})"

# --- Create 8 Route Steps ---

steps_data = [
  { position: 0, title: "Introduction to Ruby", description: "Learn the basics of Ruby syntax, variables, and data types.", content_type: :lesson, level: :nv1, status: :completed, estimated_minutes: 15 },
  { position: 1, title: "Control Flow & Methods", description: "Conditionals, loops, and defining methods in Ruby.", content_type: :lesson, level: :nv1, status: :available, estimated_minutes: 20 },
  { position: 2, title: "Ruby Practice: FizzBuzz", description: "Write a FizzBuzz solution using what you've learned.", content_type: :exercise, level: :nv1, status: :available, estimated_minutes: 15 },
  { position: 3, title: "Ruby Fundamentals Assessment", description: "Test your understanding of Ruby basics.", content_type: :assessment, level: :nv1, status: :locked, estimated_minutes: 20 },
  { position: 4, title: "Ruby Basics Review", description: "Review and reinforce your Ruby fundamentals.", content_type: :review, level: :nv1, status: :locked, estimated_minutes: 10 },
  { position: 5, title: "Object-Oriented Programming", description: "Classes, objects, inheritance, and modules in Ruby.", content_type: :lesson, level: :nv2, status: :locked, estimated_minutes: 25 },
  { position: 6, title: "Ruby Collections Deep Dive", description: "Arrays, hashes, enumerables, and functional patterns.", content_type: :lesson, level: :nv2, status: :locked, estimated_minutes: 25 },
  { position: 7, title: "OOP Practice: Bank Account", description: "Build a bank account class with deposits and withdrawals.", content_type: :exercise, level: :nv2, status: :locked, estimated_minutes: 20 },
]

created_steps = steps_data.map do |attrs|
  step = route.route_steps.create!(
    **attrs,
    metadata: {},
    prerequisites: [],
    bloom_level: 0
  )
  step.update!(completed_at: Time.current) if step.completed?
  step
end

puts "  Created #{created_steps.size} route steps."

# --- Create AI Content for first 3 steps ---

lesson_1_content = <<~'MARKDOWN'
  # Introduction to Ruby

  Ruby is a dynamic, open-source programming language with a focus on simplicity and productivity. It was created by **Yukihiro "Matz" Matsumoto** in the mid-1990s.

  ## Variables and Data Types

  Ruby is dynamically typed — you don't need to declare variable types:

  ```ruby
  name = "Alice"        # String
  age = 30              # Integer
  height = 5.7          # Float
  is_student = true     # Boolean
  languages = ["Ruby", "Python", "JavaScript"]  # Array
  ```

  ## String Interpolation

  Use `#{}` inside double-quoted strings to embed expressions:

  ```ruby
  greeting = "Hello, #{name}! You are #{age} years old."
  puts greeting
  # => Hello, Alice! You are 30 years old.
  ```

  ## Symbols

  Symbols are lightweight, immutable identifiers. They're commonly used as hash keys:

  ```ruby
  status = :active
  config = { host: "localhost", port: 3000 }
  ```

  > **Key takeaway:** Ruby prioritizes developer happiness. The syntax is designed to be natural and readable.

  ## Everything is an Object

  In Ruby, everything is an object — even numbers and `nil`:

  ```ruby
  42.class       # => Integer
  "hello".class  # => String
  nil.class      # => NilClass
  true.class     # => TrueClass
  ```

  This means you can call methods on anything:

  ```ruby
  -5.abs         # => 5
  "hello".upcase # => "HELLO"
  [3, 1, 2].sort # => [1, 2, 3]
  ```
MARKDOWN

lesson_2_content = <<~'MARKDOWN'
  # Control Flow & Methods

  ## Conditionals

  Ruby supports `if`, `unless`, `case`, and ternary expressions:

  ```ruby
  age = 18

  if age >= 18
    puts "You can vote!"
  elsif age >= 16
    puts "Almost there..."
  else
    puts "Too young to vote."
  end
  ```

  The `unless` keyword is the opposite of `if`:

  ```ruby
  unless logged_in?
    redirect_to login_path
  end
  ```

  ## Loops

  ```ruby
  # times loop
  5.times { |i| puts "Iteration #{i}" }

  # each loop (most idiomatic)
  ["Ruby", "Python", "Go"].each do |lang|
    puts "I know #{lang}"
  end

  # while loop
  count = 0
  while count < 5
    puts count
    count += 1
  end
  ```

  ## Defining Methods

  ```ruby
  def greet(name, greeting: "Hello")
    "#{greeting}, #{name}!"
  end

  greet("Alice")                    # => "Hello, Alice!"
  greet("Bob", greeting: "Hey")     # => "Hey, Bob!"
  ```

  Methods implicitly return the last evaluated expression:

  ```ruby
  def square(n)
    n * n  # no explicit return needed
  end
  ```

  ## Blocks, Procs, and Lambdas

  Blocks are chunks of code passed to methods:

  ```ruby
  [1, 2, 3].map { |n| n * 2 }  # => [2, 4, 6]

  [1, 2, 3].select do |n|
    n.odd?
  end  # => [1, 3]
  ```
MARKDOWN

exercise_content = <<~'MARKDOWN'
  # FizzBuzz Challenge

  Write a method called `fizzbuzz` that takes a number `n` and prints numbers from 1 to `n` with these rules:

  - If divisible by **3**, print `"Fizz"`
  - If divisible by **5**, print `"Buzz"`
  - If divisible by **both 3 and 5**, print `"FizzBuzz"`
  - Otherwise, print the number

  ## Example Output

  ```
  1
  2
  Fizz
  4
  Buzz
  Fizz
  7
  8
  Fizz
  Buzz
  11
  Fizz
  13
  14
  FizzBuzz
  ```

  ## Starter Code

  ```ruby
  def fizzbuzz(n)
    # Your code here
  end

  fizzbuzz(15)
  ```

  **Hints:**
  - Use the modulo operator `%` to check divisibility
  - Check for divisibility by 15 first (both 3 and 5)
MARKDOWN

ContentEngine::AiContent.create!(
  route_step: created_steps[0],
  content_type: :text,
  body: lesson_1_content,
  ai_model: "seed-data",
  cached: true
)

ContentEngine::AiContent.create!(
  route_step: created_steps[1],
  content_type: :text,
  body: lesson_2_content,
  ai_model: "seed-data",
  cached: true
)

ContentEngine::AiContent.create!(
  route_step: created_steps[2],
  content_type: :exercise,
  body: exercise_content,
  ai_model: "seed-data",
  cached: true
)

puts "  Created AI content for 3 steps."

# --- Create Assessment with Questions ---

assessment = Assessments::Assessment.create!(
  route_step: created_steps[3],
  assessment_type: :level_up,
  time_limit_minutes: 15,
  passing_score: 70.0
)

Assessments::Question.create!(
  assessment: assessment,
  question_type: :multiple_choice,
  body: "What is the output of `5.class` in Ruby?",
  options: ["String", "Integer", "Float", "Number"],
  correct_answer: "Integer",
  difficulty: 1,
  bloom_level: 1,
  explanation: "In Ruby, all whole numbers are instances of the Integer class. `5.class` returns `Integer`."
)

Assessments::Question.create!(
  assessment: assessment,
  question_type: :short_answer,
  body: "What keyword is the opposite of `if` in Ruby?",
  options: [],
  correct_answer: "unless",
  difficulty: 1,
  bloom_level: 1,
  explanation: "`unless` executes the block when the condition is false, making it the opposite of `if`."
)

Assessments::Question.create!(
  assessment: assessment,
  question_type: :code,
  body: "Write a Ruby method called `double` that takes a number and returns it multiplied by 2.",
  options: [],
  correct_answer: "def double(n)\n  n * 2\nend",
  difficulty: 1,
  bloom_level: 2,
  explanation: "The method should accept one parameter and return it multiplied by 2. Ruby methods implicitly return the last expression."
)

  puts "  Created assessment with 3 questions."
  puts "=== Content Delivery Seed Complete ==="
end

seed_content_delivery
