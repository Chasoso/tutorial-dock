#include <cstdlib>
#include <exception>
#include <iostream>

void RunResourceBoundsQualificationTests();

int main() {
    try {
        RunResourceBoundsQualificationTests();
        return EXIT_SUCCESS;
    } catch (const std::exception& error) {
        std::cerr << "FAIL resource bounds: " << error.what() << '\n';
        return EXIT_FAILURE;
    }
}
