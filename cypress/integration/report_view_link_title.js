import doctype_with_link_titles from "../fixtures/doctype_with_link_titles";
const doctype_name = doctype_with_link_titles.name;

context("Report View Link Title", () => {
	before(() => {
		cy.login();
		cy.visit("/desk/website");
		cy.insert_doc("DocType", doctype_with_link_titles, true);
		cy.clear_cache();
		cy.insert_doc(
			doctype_name,
			{
				__newname: "en",
				region_name: "Kenya Coastal Region",
				language: "en",
			},
			true
		);
		cy.call("frappe.client.set_value", {
			doctype: doctype_name,
			name: "en",
			fieldname: "related_region",
			value: "en",
		});
	});

	it("resolves the title of each link against its own doctype", () => {
		cy.visit(`/desk/List/${doctype_name}/Report`);

		cy.get(`a[data-doctype="Language"][data-name="en"]`).should("have.text", "English");
		cy.get(`a[data-doctype="${doctype_name}"][data-name="en"]`).each((link) => {
			expect(link).to.have.text("Kenya Coastal Region");
		});
	});
});
