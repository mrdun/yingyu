describe("combo system", () => {
  beforeEach(() => {
    cy.visit("/");
  });

  it("should display combo correctly after 3 correct answers and reset on wrong answer", () => {
    // Mock course data with 5 questions
    cy.intercept("GET", "/courses/try", {
      statusCode: 200,
      body: {
        id: "1",
        title: "连击测试课",
        statements: [
          {
            chinese: "我",
            english: "I",
            id: 1,
            soundmark: "/aɪ/",
          },
          {
            chinese: "你",
            english: "you",
            id: 2,
            soundmark: "/juː/",
          },
          {
            chinese: "他",
            english: "he",
            id: 3,
            soundmark: "/hiː/",
          },
          {
            chinese: "她",
            english: "she",
            id: 4,
            soundmark: "/ʃiː/",
          },
          {
            chinese: "它",
            english: "it",
            id: 5,
            soundmark: "/ɪt/",
          },
        ],
      },
    }).as("getTryCourse");

    // Start game as guest
    cy.contains("开启Earthworm").click();
    cy.wait("@getTryCourse");
    cy.url().should("include", "/main/1");

    // Answer first question correctly
    cy.get('input[type="text"]').type("I{enter}");
    cy.wait(500);

    // Answer second question correctly
    cy.get('input[type="text"]').type("you{enter}");
    cy.wait(500);

    // Answer third question correctly
    cy.get('input[type="text"]').type("he{enter}");
    cy.wait(500);

    // Verify combo display shows 3连击 1.1x
    cy.get(".fixed.top-4.right-4") // Combo display container
      .should("be.visible")
      .within(() => {
        cy.contains("3 连击").should("be.visible");
        cy.contains("1.1x").should("be.visible");
        cy.get(".text-orange-400").should("exist"); // Fire icon should be orange at 3 combo
      });

    // Answer fourth question wrong
    cy.get('input[type="text"]').type("wrong{enter}");
    cy.wait(500);

    // Verify combo resets to 0
    cy.get(".fixed.top-4.right-4")
      .should("be.visible")
      .within(() => {
        cy.contains("0 连击").should("be.visible");
        cy.contains("1.0x").should("be.visible");
      });
  });

  it("should show correct multiplier at different combo milestones", () => {
    // Mock course data with 25 questions
    const statements = [];
    for (let i = 1; i <= 25; i++) {
      statements.push({
        chinese: `词${i}`,
        english: `word${i}`,
        id: i,
        soundmark: `/wɜːrd${i}/`,
      });
    }

    cy.intercept("GET", "/courses/try", {
      statusCode: 200,
      body: {
        id: "1",
        title: "连击里程碑测试课",
        statements,
      },
    }).as("getTryCourse");

    cy.contains("开启Earthworm").click();
    cy.wait("@getTryCourse");
    cy.url().should("include", "/main/1");

    // Test 5 combo = 1.2x
    for (let i = 1; i <= 5; i++) {
      cy.get('input[type="text"]').type(`word${i}{enter}`);
      cy.wait(200);
    }
    cy.contains("1.2x").should("be.visible");

    // Test 10 combo = 1.5x
    for (let i = 6; i <= 10; i++) {
      cy.get('input[type="text"]').type(`word${i}{enter}`);
      cy.wait(200);
    }
    cy.contains("1.5x").should("be.visible");

    // Test 20 combo = 2.0x
    for (let i = 11; i <= 20; i++) {
      cy.get('input[type="text"]').type(`word${i}{enter}`);
      cy.wait(200);
    }
    cy.contains("2.0x").should("be.visible");
  });
});
